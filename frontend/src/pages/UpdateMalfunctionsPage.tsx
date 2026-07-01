import { useEffect, useMemo, useState } from 'react'
import {
  Malfunctions,
  Projects,
  ProjectTree,
  type MalfunctionDetail,
  type MalfunctionListRow,
  type Project,
  type ProjectItemNode,
} from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useAlert } from '../components/Dialog'
import { inputStyle } from '../components/Modal'
import { DefectRow } from '../components/DefectDetail'
import DefectFormDialog from '../components/DefectFormDialog'
import ActivityFormDialog from '../components/ActivityFormDialog'

const UNIT_TYPE_LABEL: Record<string, string> = {
  apartment: 'דירה',
  parking: 'חניה',
  storage: 'מחסן',
  shop: 'חנות',
  public_area: 'ציבורי',
}

type Filters = { buildingId: number | null; entranceId: number | null; unitId: number | null }
type GroupBy = 'location' | 'professional'

const NO_LOCATION = 'ללא מיקום'
const NO_PROFESSIONAL = 'לא שויך'

function findItem(tree: ProjectItemNode[], id: number): ProjectItemNode | null {
  for (const n of tree) {
    if (n.id === id) return n
    const child = findItem(n.children, id)
    if (child) return child
  }
  return null
}

function findAncestors(tree: ProjectItemNode[], id: number): ProjectItemNode[] {
  function walk(nodes: ProjectItemNode[], path: ProjectItemNode[]): ProjectItemNode[] | null {
    for (const n of nodes) {
      const cur = [...path, n]
      if (n.id === id) return cur
      const found = walk(n.children, cur)
      if (found) return found
    }
    return null
  }
  return walk(tree, []) || []
}

type DefectGroup = { key: string; label: string; rows: MalfunctionListRow[] }

/** Group defects by location or by professional; unassigned bucket sorts last. */
function groupDefects(defects: MalfunctionListRow[], by: GroupBy): DefectGroup[] {
  const fallback = by === 'location' ? NO_LOCATION : NO_PROFESSIONAL
  const buckets = new Map<string, MalfunctionListRow[]>()
  for (const d of defects) {
    const label = (by === 'location' ? d.location_name : d.professional) || fallback
    const arr = buckets.get(label) || []
    arr.push(d)
    buckets.set(label, arr)
  }
  return [...buckets.entries()]
    .map(([label, rows]) => ({ key: label, label, rows }))
    .sort((a, b) => {
      if (a.label === fallback) return 1
      if (b.label === fallback) return -1
      return a.label.localeCompare(b.label, 'he')
    })
}

const labelTextStyle: React.CSSProperties = { marginBottom: 4, color: 'var(--color-text-light)' }

export default function UpdateMalfunctionsPage() {
  const { user, activeProject, workScope } = useAuth()
  const companyId = useEffectiveCompanyId()
  const alert = useAlert()
  const canWrite = user?.role === 'super_admin' || user?.role === 'company_admin'

  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(activeProject?.id ?? null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [filter, setFilter] = useState<Filters>({
    buildingId: workScope.buildingId,
    entranceId: workScope.entranceId,
    unitId: workScope.unitId,
  })
  const [groupBy, setGroupBy] = useState<GroupBy>('location')

  const [defects, setDefects] = useState<MalfunctionListRow[]>([])
  const [unit, setUnit] = useState<ProjectItemNode | null>(null)
  const [ancestors, setAncestors] = useState<ProjectItemNode[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [details, setDetails] = useState<Map<number, MalfunctionDetail>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [defectFormOpen, setDefectFormOpen] = useState(false)
  const [editingDefect, setEditingDefect] = useState<MalfunctionDetail | null>(null)
  const [activityFormOpenFor, setActivityFormOpenFor] = useState<number | null>(null)

  const needsCompany = user?.role === 'super_admin' && !companyId

  // Cascading option lists from the tree.
  const buildings = useMemo(() => tree.filter((n) => n.kind === 'building'), [tree])
  const entrances = useMemo(() => {
    const b = buildings.find((x) => x.id === filter.buildingId)
    return b ? b.children.filter((n) => n.kind === 'entrance') : []
  }, [buildings, filter.buildingId])
  const units = useMemo(() => {
    const b = buildings.find((x) => x.id === filter.buildingId)
    const e = b?.children.find((x) => x.id === filter.entranceId)
    if (!e) return [] as { node: ProjectItemNode; floor: string }[]
    const out: { node: ProjectItemNode; floor: string }[] = []
    for (const floor of e.children)
      for (const u of floor.children) if (u.kind === 'unit') out.push({ node: u, floor: floor.name })
    return out
  }, [buildings, filter.buildingId, filter.entranceId])

  useEffect(() => {
    if (needsCompany) return
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then((p) => {
        setProjects(p)
        if (p.length && !projectId) setProjectId(p[0].id)
      })
      .catch((e) => setError(String(e)))
  }, [user?.role, companyId])

  useEffect(() => {
    if (!projectId) return
    ProjectTree.list(projectId)
      .then(setTree)
      .catch((e) => setError(String(e)))
  }, [projectId])

  function load() {
    if (!projectId || !filter.unitId) {
      setDefects([])
      setUnit(null)
      setAncestors([])
      return
    }
    setLoading(true)
    Promise.all([Malfunctions.byUnit(projectId, filter.unitId, true), ProjectTree.list(projectId)])
      .then(([d, t]) => {
        setDefects(d)
        setUnit(findItem(t, filter.unitId!))
        setAncestors(findAncestors(t, filter.unitId!))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    setExpanded(new Set())
    setDetails(new Map())
    load()
  }, [projectId, filter.unitId])

  async function toggle(defectId: number) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(defectId)) next.delete(defectId)
      else next.add(defectId)
      return next
    })
    if (!details.has(defectId)) {
      try {
        const d = await Malfunctions.get(defectId)
        setDetails((prev) => new Map(prev).set(defectId, d))
      } catch (e) {
        setError(String(e))
      }
    }
  }

  async function refreshDetail(defectId: number) {
    const fresh = await Malfunctions.get(defectId)
    setDetails((prev) => new Map(prev).set(defectId, fresh))
  }

  const groups = useMemo(() => groupDefects(defects, groupBy), [defects, groupBy])

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לעדכן תקלות</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>עידכון תקלות</h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          בחר יחידה כדי לצפות ולעדכן את התקלות שלה — לפי מיקומים או לפי מקצועות
        </div>
      </div>

      {/* Unit picker */}
      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 14,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 12,
          padding: '12px 14px',
        }}
      >
        <label style={{ fontSize: '0.8rem' }}>
          <div style={labelTextStyle}>פרויקט</div>
          <select
            value={projectId ?? ''}
            onChange={(e) => {
              setProjectId(e.target.value ? Number(e.target.value) : null)
              setFilter({ buildingId: null, entranceId: null, unitId: null })
            }}
            style={{ ...inputStyle, minWidth: 220 }}
          >
            <option value="">— בחר פרויקט —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: '0.8rem' }}>
          <div style={labelTextStyle}>בניין</div>
          <select
            value={filter.buildingId ?? ''}
            onChange={(e) =>
              setFilter({
                buildingId: e.target.value ? Number(e.target.value) : null,
                entranceId: null,
                unitId: null,
              })
            }
            style={{ ...inputStyle, minWidth: 140 }}
          >
            <option value="">— בחר —</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: '0.8rem' }}>
          <div style={labelTextStyle}>כניסה</div>
          <select
            value={filter.entranceId ?? ''}
            disabled={!filter.buildingId}
            onChange={(e) =>
              setFilter((f) => ({
                ...f,
                entranceId: e.target.value ? Number(e.target.value) : null,
                unitId: null,
              }))
            }
            style={{ ...inputStyle, minWidth: 120 }}
          >
            <option value="">— בחר —</option>
            {entrances.map((en) => (
              <option key={en.id} value={en.id}>
                {en.name}
              </option>
            ))}
          </select>
        </label>

        <label style={{ fontSize: '0.8rem' }}>
          <div style={labelTextStyle}>יחידה</div>
          <select
            value={filter.unitId ?? ''}
            disabled={!filter.entranceId}
            onChange={(e) => setFilter((f) => ({ ...f, unitId: e.target.value ? Number(e.target.value) : null }))}
            style={{ ...inputStyle, minWidth: 200 }}
          >
            <option value="">— בחר יחידה —</option>
            {units.map(({ node, floor }) => (
              <option key={node.id} value={node.id}>
                {UNIT_TYPE_LABEL[node.unit_type || ''] || 'יחידה'} {node.short_code || node.number || ''} · {floor}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      {!filter.unitId ? (
        <div className="tact-kpi" style={{ textAlign: 'center', padding: '48px 20px', border: '1px dashed var(--color-border)' }}>
          <div className="tact-kpi-label">בחר יחידה כדי להציג את התקלות שלה</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <>
          {/* Unit header */}
          {unit && (
            <div
              style={{
                background: 'var(--color-bg-white)',
                border: '1px solid var(--color-border)',
                borderRadius: 14,
                padding: '16px 20px',
                marginBottom: 16,
              }}
            >
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-primary)' }}>{unit.name}</h3>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: '0.84rem', color: 'var(--color-text-light)', marginTop: 6 }}>
                {ancestors
                  .filter((a) => a.id !== unit.id)
                  .map((a) => (
                    <span key={a.id}>
                      <strong style={{ color: 'var(--color-text)' }}>{a.name}</strong>
                    </span>
                  ))}
                {unit.number && (
                  <code
                    style={{
                      fontFamily: 'var(--font-family-en)',
                      background: 'var(--color-bg)',
                      border: '1px solid var(--color-border)',
                      borderRadius: 6,
                      padding: '2px 8px',
                      fontSize: '0.76rem',
                    }}
                  >
                    {unit.number}
                  </code>
                )}
              </div>
            </div>
          )}

          {/* Toolbar: group-by toggle + new defect */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>הצג לפי:</span>
            <div style={{ display: 'inline-flex', border: '1px solid var(--color-border)', borderRadius: 10, overflow: 'hidden' }}>
              <button
                onClick={() => setGroupBy('location')}
                className={groupBy === 'location' ? 'tact-btn tact-btn-primary' : 'tact-btn tact-btn-ghost'}
                style={{ borderRadius: 0, padding: '6px 16px', fontSize: '0.82rem' }}
              >
                מיקומים
              </button>
              <button
                onClick={() => setGroupBy('professional')}
                className={groupBy === 'professional' ? 'tact-btn tact-btn-primary' : 'tact-btn tact-btn-ghost'}
                style={{ borderRadius: 0, padding: '6px 16px', fontSize: '0.82rem' }}
              >
                מקצועות
              </button>
            </div>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
              {defects.length} תקלות
            </span>
            <span style={{ flex: 1 }} />
            {canWrite && (
              <button
                onClick={() => setDefectFormOpen(true)}
                className="tact-btn tact-btn-primary"
                style={{ padding: '8px 18px', fontSize: '0.85rem' }}
              >
                + תקלה חדשה
              </button>
            )}
          </div>

          {defects.length === 0 ? (
            <div className="tact-kpi" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="tact-kpi-label">אין תקלות ביחידה זו</div>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.key} style={{ marginBottom: 16 }}>
                <div
                  style={{
                    fontWeight: 700,
                    color: 'var(--color-primary)',
                    fontSize: '0.9rem',
                    padding: '6px 4px',
                    display: 'flex',
                    gap: 8,
                    alignItems: 'baseline',
                  }}
                >
                  {g.label}
                  <span style={{ color: 'var(--color-text-light)', fontWeight: 400, fontSize: '0.78rem' }}>
                    ({g.rows.length})
                  </span>
                </div>
                <div
                  style={{
                    background: 'var(--color-bg-white)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 14,
                    overflow: 'hidden',
                  }}
                >
                  {g.rows.map((d) => (
                    <DefectRow
                      key={d.id}
                      defect={d}
                      expanded={expanded.has(d.id)}
                      detail={details.get(d.id)}
                      canWrite={canWrite}
                      onToggle={() => toggle(d.id)}
                      onEdit={() => {
                        const det = details.get(d.id)
                        if (det) setEditingDefect(det)
                        else Malfunctions.get(d.id).then(setEditingDefect)
                      }}
                      onAddActivity={() => setActivityFormOpenFor(d.id)}
                    />
                  ))}
                </div>
              </div>
            ))
          )}
        </>
      )}

      <DefectFormDialog
        open={defectFormOpen || editingDefect !== null}
        mode={
          editingDefect
            ? { kind: 'edit', defect: editingDefect }
            : defectFormOpen && projectId && filter.unitId
              ? { kind: 'create', projectId, unitId: filter.unitId }
              : null
        }
        unitSubtree={unit}
        onClose={() => {
          setDefectFormOpen(false)
          setEditingDefect(null)
        }}
        onSaved={() => {
          setDefectFormOpen(false)
          const wasEditingId = editingDefect?.id
          setEditingDefect(null)
          load()
          if (wasEditingId) refreshDetail(wasEditingId).catch(() => {})
        }}
        onError={(msg) => alert({ title: 'שגיאה', message: msg, variant: 'danger' })}
      />

      <ActivityFormDialog
        open={activityFormOpenFor !== null}
        defectId={activityFormOpenFor}
        defaultPerformedBy={
          activityFormOpenFor !== null ? details.get(activityFormOpenFor)?.professional || null : null
        }
        onClose={() => setActivityFormOpenFor(null)}
        onSaved={() => {
          const id = activityFormOpenFor
          setActivityFormOpenFor(null)
          if (id !== null) refreshDetail(id).catch(() => {})
        }}
        onError={(msg) => alert({ title: 'שגיאה', message: msg, variant: 'danger' })}
      />
    </div>
  )
}

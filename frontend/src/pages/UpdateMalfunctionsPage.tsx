import { useEffect, useMemo, useState } from 'react'
import {
  Malfunctions,
  ProjectTree,
  type MalfunctionDetail,
  type MalfunctionListRow,
  type ProjectItemNode,
} from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { useAlert } from '../components/Dialog'
import { DefectRow } from '../components/DefectDetail'
import DefectFormDialog from '../components/DefectFormDialog'
import ActivityFormDialog from '../components/ActivityFormDialog'

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

export default function UpdateMalfunctionsPage() {
  const { user, activeProject, workScope } = useAuth()
  const alert = useAlert()
  const canWrite = user?.role === 'super_admin' || user?.role === 'company_admin'

  const projectId = activeProject?.id ?? null
  const unitId = workScope.unitId

  const [defects, setDefects] = useState<MalfunctionListRow[]>([])
  const [unit, setUnit] = useState<ProjectItemNode | null>(null)
  const [ancestors, setAncestors] = useState<ProjectItemNode[]>([])
  const [groupBy, setGroupBy] = useState<GroupBy>('location')
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [details, setDetails] = useState<Map<number, MalfunctionDetail>>(new Map())
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [defectFormOpen, setDefectFormOpen] = useState(false)
  const [editingDefect, setEditingDefect] = useState<MalfunctionDetail | null>(null)
  const [activityFormOpenFor, setActivityFormOpenFor] = useState<number | null>(null)

  function load() {
    if (!projectId || !unitId) {
      setDefects([])
      setUnit(null)
      setAncestors([])
      return
    }
    setLoading(true)
    setError(null)
    Promise.all([Malfunctions.byUnit(projectId, unitId, true), ProjectTree.list(projectId)])
      .then(([d, t]) => {
        setDefects(d)
        setUnit(findItem(t, unitId))
        setAncestors(findAncestors(t, unitId))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
    setExpanded(new Set())
    setDetails(new Map())
    load()
  }, [projectId, unitId])

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

  async function expandAll() {
    const ids = defects.map((d) => d.id)
    setExpanded(new Set(ids))
    const missing = ids.filter((id) => !details.has(id))
    if (!missing.length) return
    const fetched = await Promise.all(
      missing.map((id) =>
        Malfunctions.get(id)
          .then((d) => [id, d] as const)
          .catch(() => null),
      ),
    )
    setDetails((prev) => {
      const next = new Map(prev)
      for (const r of fetched) if (r) next.set(r[0], r[1])
      return next
    })
  }

  function collapseAll() {
    setExpanded(new Set())
  }

  const groups = useMemo(() => groupDefects(defects, groupBy), [defects, groupBy])

  // No unit chosen in the top bar → prompt the user to pick one.
  if (!projectId || !unitId) {
    return (
      <div
        className="tact-kpi"
        style={{ textAlign: 'center', padding: '56px 20px', border: '1px dashed var(--color-border)' }}
      >
        <div style={{ fontSize: '2rem', marginBottom: 10 }}>🏠</div>
        <div className="tact-kpi-label" style={{ fontSize: '1rem' }}>
          יש לבחור יחידה כדי לעדכן תקלות
        </div>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)', marginTop: 6 }}>
          בחר פרויקט · בניין · כניסה · יחידה בסרגל שבראש המסך
        </div>
      </div>
    )
  }

  return (
    <div>
      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      {loading ? (
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
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap', fontSize: '0.84rem', color: 'var(--color-text-light)' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--color-primary)', margin: 0 }}>{unit.name}</h3>
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
            <button
              onClick={expandAll}
              className="tact-btn tact-btn-ghost"
              title="הרחב הכל"
              disabled={defects.length === 0}
              style={{ padding: 0, width: 30, height: 30, fontSize: '1.1rem', lineHeight: 1 }}
            >
              +
            </button>
            <button
              onClick={collapseAll}
              className="tact-btn tact-btn-ghost"
              title="כווץ הכל"
              disabled={expanded.size === 0}
              style={{ padding: 0, width: 30, height: 30, fontSize: '1.1rem', lineHeight: 1 }}
            >
              −
            </button>
            <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>{defects.length} תקלות</span>
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
                      compact
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
            : defectFormOpen && projectId && unitId
              ? { kind: 'create', projectId, unitId }
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
        onAddActivity={() => {
          if (editingDefect) setActivityFormOpenFor(editingDefect.id)
        }}
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
          if (id !== null) {
            // Refresh the row detail and, if this defect is open in the edit
            // dialog, update it too so the activity log reflects the addition.
            Malfunctions.get(id)
              .then((fresh) => {
                setDetails((prev) => new Map(prev).set(id, fresh))
                setEditingDefect((cur) => (cur && cur.id === id ? fresh : cur))
              })
              .catch(() => {})
          }
        }}
        onError={(msg) => alert({ title: 'שגיאה', message: msg, variant: 'danger' })}
      />
    </div>
  )
}

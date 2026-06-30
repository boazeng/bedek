import { useEffect, useState } from 'react'
import {
  Malfunctions,
  Projects,
  ProjectTree,
  type ProjectItemNode,
} from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { inputStyle } from '../components/Modal'
import MalfunctionTree from '../components/MalfunctionTree'
import type { CollapseCmd } from '../components/builder/shared'
import { useMemo } from 'react'

type Props = { onOpenUnit: (projectId: number, unitId: number) => void }

const UNIT_TYPE_LABEL: Record<string, string> = {
  apartment: 'דירה',
  parking: 'חניה',
  storage: 'מחסן',
  shop: 'חנות',
  public_area: 'ציבורי',
}

type TreeFilter = { buildingId: number | null; entranceId: number | null; unitId: number | null }

/** Prune the project tree to the chosen building / entrance / unit. */
function filterTree(tree: ProjectItemNode[], f: TreeFilter): ProjectItemNode[] {
  let buildings = tree
  if (f.buildingId) buildings = buildings.filter((b) => b.id === f.buildingId)
  return buildings.map((b) => {
    let entrances = b.children
    if (f.entranceId) entrances = entrances.filter((e) => e.id === f.entranceId)
    if (!f.unitId) return { ...b, children: entrances }
    const prunedEntrances = entrances.map((e) => {
      const floors = e.children
        .map((fl) => {
          const units = fl.children.filter((u) => u.id === f.unitId)
          return units.length ? { ...fl, children: units } : null
        })
        .filter((x): x is ProjectItemNode => x !== null)
      return { ...e, children: floors }
    })
    return { ...b, children: prunedEntrances }
  })
}

export default function MalfunctionsPage({ onOpenUnit }: Props) {
  const { user, activeProject, workScope } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [defectCounts, setDefectCounts] = useState<Map<number, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapseCmd, setCollapseCmd] = useState<CollapseCmd>({ all: false, n: 0 })
  const [filter, setFilter] = useState<TreeFilter>({ buildingId: null, entranceId: null, unitId: null })
  const [unitsOnly, setUnitsOnly] = useState(false)

  const needsCompany = user?.role === 'super_admin' && !companyId

  // Cascading filter option lists, derived from the project tree.
  const fBuildings = useMemo(() => tree.filter((n) => n.kind === 'building'), [tree])
  const fEntrances = useMemo(() => {
    const b = fBuildings.find((x) => x.id === filter.buildingId)
    return b ? b.children.filter((n) => n.kind === 'entrance') : []
  }, [fBuildings, filter.buildingId])
  const fUnits = useMemo(() => {
    const b = fBuildings.find((x) => x.id === filter.buildingId)
    const e = b?.children.find((x) => x.id === filter.entranceId)
    if (!e) return [] as { node: ProjectItemNode; floor: string }[]
    const out: { node: ProjectItemNode; floor: string }[] = []
    for (const floor of e.children)
      for (const u of floor.children) if (u.kind === 'unit') out.push({ node: u, floor: floor.name })
    return out
  }, [fBuildings, filter.buildingId, filter.entranceId])

  const filteredTree = useMemo(() => filterTree(tree, filter), [tree, filter])
  const isFiltered = !!(filter.buildingId || filter.entranceId || filter.unitId)

  useEffect(() => {
    if (needsCompany) return
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then((p) => {
        if (p.length && !projectId) {
          const active = activeProject && p.find((x) => x.id === activeProject.id)
          setProjectId(active ? active.id : p[0].id)
        }
      })
      .catch((e) => setError(String(e)))
  }, [user?.role, companyId])

  // Follow the globally-selected (active) project — no project field on screen.
  useEffect(() => {
    if (activeProject) setProjectId(activeProject.id)
  }, [activeProject?.id])

  useEffect(() => {
    if (!projectId) return
    setFilter({ buildingId: null, entranceId: null, unitId: null })
    setLoading(true)
    Promise.all([ProjectTree.list(projectId), Malfunctions.unitsWithDefects(projectId, null)])
      .then(([t, units]) => {
        setTree(t)
        setDefectCounts(new Map(units.map((u) => [u.id, u.open_defects])))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [projectId])

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לצפות בתקלות</div>
      </div>
    )
  }

  const totalOpen = [...defectCounts.values()].reduce((s, n) => s + n, 0)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          תקלות
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          מבנה הפרויקט המלא — בניין · כניסה · קומה · יחידה, עם התקלות הפתוחות בכל יחידה
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          gap: 10,
          marginBottom: 16,
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <button
          className={unitsOnly ? 'tact-btn tact-btn-primary' : 'tact-btn tact-btn-ghost'}
          onClick={() => setUnitsOnly((v) => !v)}
          disabled={tree.length === 0}
          title="הצג רק יחידות ממכר, ללא בניין/כניסה/קומות"
        >
          יחידות
        </button>
        <span style={{ flex: 1 }} />
        <button
          className="tact-btn tact-btn-ghost"
          onClick={() => setCollapseCmd((c) => ({ all: true, n: c.n + 1 }))}
          disabled={tree.length === 0}
        >
          כווץ הכל
        </button>
        <button
          className="tact-btn tact-btn-ghost"
          onClick={() => setCollapseCmd((c) => ({ all: false, n: c.n + 1 }))}
          disabled={tree.length === 0}
        >
          הרחב הכל
        </button>
      </div>

      {/* Filters: building → entrance → unit, by-selection (top bar), or show all. */}
      {projectId && tree.length > 0 && (
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
            <div style={{ marginBottom: 4, color: 'var(--color-text-light)' }}>בניין</div>
            <select
              value={filter.buildingId ?? ''}
              onChange={(e) =>
                setFilter({
                  buildingId: e.target.value ? Number(e.target.value) : null,
                  entranceId: null,
                  unitId: null,
                })
              }
              style={{ ...inputStyle, minWidth: 150 }}
            >
              <option value="">הכל</option>
              {fBuildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.8rem' }}>
            <div style={{ marginBottom: 4, color: 'var(--color-text-light)' }}>כניסה</div>
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
              style={{ ...inputStyle, minWidth: 130 }}
            >
              <option value="">הכל</option>
              {fEntrances.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.name}
                </option>
              ))}
            </select>
          </label>
          <label style={{ fontSize: '0.8rem' }}>
            <div style={{ marginBottom: 4, color: 'var(--color-text-light)' }}>יחידה</div>
            <select
              value={filter.unitId ?? ''}
              disabled={!filter.entranceId}
              onChange={(e) =>
                setFilter((f) => ({ ...f, unitId: e.target.value ? Number(e.target.value) : null }))
              }
              style={{ ...inputStyle, minWidth: 170 }}
            >
              <option value="">הכל</option>
              {fUnits.map(({ node, floor }) => (
                <option key={node.id} value={node.id}>
                  {UNIT_TYPE_LABEL[node.unit_type || ''] || 'יחידה'} {node.short_code || node.number || ''} · {floor}
                </option>
              ))}
            </select>
          </label>
          <span style={{ flex: 1 }} />
          <button
            className="tact-btn tact-btn-ghost"
            onClick={() =>
              setFilter({
                buildingId: workScope.buildingId,
                entranceId: workScope.entranceId,
                unitId: workScope.unitId,
              })
            }
            disabled={!workScope.buildingId}
            title="סנן לפי הבניין/כניסה/יחידה שנבחרו בסרגל העליון"
          >
            סנן לפי הבחירה
          </button>
          <button
            className={isFiltered ? 'tact-btn tact-btn-primary' : 'tact-btn tact-btn-ghost'}
            onClick={() => setFilter({ buildingId: null, entranceId: null, unitId: null })}
            disabled={!isFiltered}
          >
            הצג הכל
          </button>
        </div>
      )}

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      <div style={{ marginBottom: 10, fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
        {projectId && !loading && (
          <>
            <strong>{defectCounts.size}</strong> יחידות · <strong>{totalOpen}</strong> תקלות פתוחות
          </>
        )}
      </div>

      {loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : !projectId ? (
        <div style={{ color: 'var(--color-text-light)' }}>בחר פרויקט להצגת המבנה</div>
      ) : (
        <MalfunctionTree
          projectId={projectId}
          tree={filteredTree}
          defectCounts={defectCounts}
          collapseCmd={collapseCmd}
          onOpenUnit={onOpenUnit}
          flat={unitsOnly}
        />
      )}
    </div>
  )
}

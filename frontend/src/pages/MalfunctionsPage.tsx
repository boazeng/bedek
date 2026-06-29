import { useEffect, useState } from 'react'
import {
  Malfunctions,
  Projects,
  ProjectTree,
  type Project,
  type ProjectItemNode,
} from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { inputStyle } from '../components/Modal'
import MalfunctionTree from '../components/MalfunctionTree'
import type { CollapseCmd } from '../components/builder/shared'

type Props = { onOpenUnit: (projectId: number, unitId: number) => void }

export default function MalfunctionsPage({ onOpenUnit }: Props) {
  const { user, activeProject } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [defectCounts, setDefectCounts] = useState<Map<number, number>>(new Map())
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [collapseCmd, setCollapseCmd] = useState<CollapseCmd>({ all: false, n: 0 })

  const needsCompany = user?.role === 'super_admin' && !companyId

  useEffect(() => {
    if (needsCompany) return
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then((p) => {
        setProjects(p)
        if (p.length && !projectId) {
          const active = activeProject && p.find((x) => x.id === activeProject.id)
          setProjectId(active ? active.id : p[0].id)
        }
      })
      .catch((e) => setError(String(e)))
  }, [user?.role, companyId])

  useEffect(() => {
    if (!projectId) return
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
          gap: 12,
          marginBottom: 16,
          alignItems: 'flex-end',
          flexWrap: 'wrap',
        }}
      >
        <label style={{ fontSize: '0.85rem' }}>
          <div style={{ marginBottom: 4, color: 'var(--color-text-light)' }}>פרויקט</div>
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            style={{ ...inputStyle, minWidth: 240 }}
          >
            <option value="">— בחר פרויקט —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
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
          tree={tree}
          defectCounts={defectCounts}
          collapseCmd={collapseCmd}
          onOpenUnit={onOpenUnit}
        />
      )}
    </div>
  )
}

import { useEffect, useState } from 'react'
import {
  Malfunctions,
  ProjectTree,
  type MalfunctionDetail,
  type MalfunctionListRow,
  type ProjectItemNode,
} from '../lib/api'
import type { NavKey } from '../components/AppShell'
import { useAuth } from '../lib/AuthContext'
import { useAlert } from '../components/Dialog'
import DefectFormDialog from '../components/DefectFormDialog'
import ActivityFormDialog from '../components/ActivityFormDialog'
import { DefectRow } from '../components/DefectDetail'

type Props = {
  projectId: number
  unitId: number
  onNavigate: (k: NavKey) => void
}

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

export default function UnitDefectsPage({ projectId, unitId, onNavigate }: Props) {
  const { user } = useAuth()
  const alert = useAlert()
  const canWrite = user?.role === 'super_admin' || user?.role === 'company_admin'
  const [defects, setDefects] = useState<MalfunctionListRow[]>([])
  const [unit, setUnit] = useState<ProjectItemNode | null>(null)
  const [ancestors, setAncestors] = useState<ProjectItemNode[]>([])
  const [expanded, setExpanded] = useState<Set<number>>(new Set())
  const [details, setDetails] = useState<Map<number, MalfunctionDetail>>(new Map())
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [defectFormOpen, setDefectFormOpen] = useState(false)
  const [editingDefect, setEditingDefect] = useState<MalfunctionDetail | null>(null)
  const [activityFormOpenFor, setActivityFormOpenFor] = useState<number | null>(null)

  function load() {
    setLoading(true)
    Promise.all([
      Malfunctions.byUnit(projectId, unitId),
      ProjectTree.list(projectId),
    ])
      .then(([d, tree]) => {
        setDefects(d)
        setUnit(findItem(tree, unitId))
        setAncestors(findAncestors(tree, unitId))
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(() => {
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

  if (loading) return <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
  if (error) return <div style={{ color: 'var(--color-accent)' }}>{error}</div>

  return (
    <div>
      <button
        onClick={() => onNavigate('malfunctions')}
        className="tact-btn tact-btn-ghost"
        style={{ padding: '6px 14px', fontSize: '0.82rem', marginBottom: 14 }}
      >
        ← חזרה לרשימת תקלות
      </button>

      {unit && (
        <div
          style={{
            background: 'var(--color-bg-white)',
            border: '1px solid var(--color-border)',
            borderRadius: 14,
            padding: '18px 22px',
            marginBottom: 18,
          }}
        >
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            {unit.name}
          </h2>
          <div
            style={{
              display: 'flex',
              gap: 16,
              flexWrap: 'wrap',
              fontSize: '0.86rem',
              color: 'var(--color-text-light)',
              marginTop: 6,
            }}
          >
            {ancestors
              .filter((a) => a.id !== unit.id)
              .map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ' / '}
                  <strong style={{ color: 'var(--color-text)' }}>{a.name}</strong>
                  {a.short_code && <code style={{ marginInlineStart: 4, fontFamily: 'var(--font-family-en)', fontSize: '0.78rem' }}>· {a.short_code}</code>}
                </span>
              ))}
            {unit.direction && (
              <span>
                כיוון: <strong style={{ color: 'var(--color-text)' }}>{unit.direction}</strong>
              </span>
            )}
            {unit.number && (
              <code
                style={{
                  fontFamily: 'var(--font-family-en)',
                  background: 'var(--color-bg)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 6,
                  padding: '2px 8px',
                  fontSize: '0.78rem',
                }}
              >
                {unit.number}
              </code>
            )}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          תקלות פתוחות ({defects.length})
        </h3>
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

      <div
        style={{
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          overflow: 'hidden',
        }}
      >
        {defects.length === 0 ? (
          <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--color-text-light)' }}>
            אין תקלות פתוחות ביחידה זו
          </div>
        ) : (
          defects.map((d) => (
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
          ))
        )}
      </div>

      <DefectFormDialog
        open={defectFormOpen || editingDefect !== null}
        mode={
          editingDefect
            ? { kind: 'edit', defect: editingDefect }
            : defectFormOpen
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
      />

      <ActivityFormDialog
        open={activityFormOpenFor !== null}
        defectId={activityFormOpenFor}
        defaultPerformedBy={
          activityFormOpenFor !== null
            ? details.get(activityFormOpenFor)?.professional || null
            : null
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

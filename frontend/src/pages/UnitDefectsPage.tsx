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
import AttachmentsPanel from '../components/AttachmentsPanel'

type Props = {
  projectId: number
  unitId: number
  onNavigate: (k: NavKey) => void
}

const STATUS_LABEL: Record<string, string> = {
  pending_manager: 'ממתין לאישור',
  todo: 'לביצוע',
  negotiation: 'מו"מ',
  frozen: 'מוקפא',
  done: 'הסתיים',
  cancelled: 'בוטל',
}

const STATUS_CLASS: Record<string, string> = {
  todo: 'tact-badge-on',
  pending_manager: 'tact-badge-new',
  negotiation: 'tact-badge-soon',
  frozen: 'tact-badge-soon',
  done: 'tact-badge-pos',
  cancelled: 'tact-badge-soon',
}

const GROUP_LABEL: Record<string, string> = {
  electricity: 'חשמל',
  plumbing: 'אינסטלציה',
  finishes: 'גמרים',
  structure: 'שלד',
  protection: 'מיגון',
  sealing: 'איטום',
  aluminum: 'אלומיניום',
  unassigned: 'טרם נבחר',
}

const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  manual: 'ידני',
  bedek_report: 'דוח בדק',
  inspector_tour: 'סיור מפקח',
  delivery_protocol: 'פרוטוקול מסירה',
  email: 'מייל',
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

function DefectRow({
  defect,
  expanded,
  detail,
  canWrite,
  onToggle,
  onEdit,
  onAddActivity,
}: {
  defect: MalfunctionListRow
  expanded: boolean
  detail: MalfunctionDetail | undefined
  canWrite: boolean
  onToggle: () => void
  onEdit: () => void
  onAddActivity: () => void
}) {
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: expanded ? 'var(--color-primary-soft)' : 'transparent',
          border: 'none',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: '24px 1fr 110px 100px 100px 110px',
          gap: 10,
          alignItems: 'center',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'start',
        }}
      >
        <span style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>
          {expanded ? '▼' : '◀'}
        </span>
        <span style={{ fontWeight: 500, fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {defect.number && (
            <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.72rem', color: 'var(--color-primary)' }}>
              {defect.number}
            </code>
          )}
          <span>{defect.description}</span>
        </span>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
          {defect.project_item_name || '—'}
        </span>
        <span className={`tact-badge ${STATUS_CLASS[defect.status] || ''}`}>
          {STATUS_LABEL[defect.status] || defect.status}
        </span>
        <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
          {GROUP_LABEL[defect.group] || defect.group}
        </span>
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
          {new Date(defect.opened_at).toLocaleDateString('he-IL')}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '14px 22px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}>
          {!detail ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>טוען פרטים…</div>
          ) : (
            <>
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginBottom: 12 }}>
                  <button
                    onClick={onEdit}
                    className="tact-btn tact-btn-ghost"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    ערוך תקלה
                  </button>
                  <button
                    onClick={onAddActivity}
                    className="tact-btn tact-btn-ghost"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    + פעילות חדשה
                  </button>
                </div>
              )}
              <DefectDetailView detail={detail} canWrite={canWrite} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DefectDetailView({ detail, canWrite }: { detail: MalfunctionDetail; canWrite: boolean }) {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Field label="מספר תקלה">
          <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.82rem', color: 'var(--color-primary)', fontWeight: 700 }}>
            {detail.number || '—'}
          </code>
        </Field>
        <Field label="ישות ספציפית">
          <div>
            <strong>{detail.project_item_name || '—'}</strong>
            {detail.project_item_number && (
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-light)', fontFamily: 'var(--font-family-en)', marginTop: 2 }}>
                {detail.project_item_number}
              </div>
            )}
          </div>
        </Field>
        <Field label="בעל מקצוע">
          <span>{detail.professional || <em style={{ color: 'var(--color-text-light)' }}>לא שויך</em>}</span>
        </Field>
        <Field label="קבוצה">
          <span>{GROUP_LABEL[detail.group] || detail.group}</span>
        </Field>
        <Field label="מקור">
          <span>{SOURCE_LABEL[detail.source] || detail.source}</span>
        </Field>
        <Field label="תאריך פתיחה">
          <span>{new Date(detail.opened_at).toLocaleDateString('he-IL')}</span>
        </Field>
        <Field label="תאריך סגירה">
          <span>{detail.closed_at ? new Date(detail.closed_at).toLocaleDateString('he-IL') : <em style={{ color: 'var(--color-text-light)' }}>פתוחה</em>}</span>
        </Field>
      </div>

      <Field label="תיאור התקלה">
        <div style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</div>
      </Field>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 8 }}>
          יומן פעילויות ({detail.activities.length})
        </div>
        {detail.activities.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
            עדיין לא תועדו פעילויות
          </div>
        ) : (
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              borderInlineStart: '2px solid var(--color-primary-soft)',
              paddingInlineStart: 14,
            }}
          >
            {detail.activities.map((a) => (
              <li key={a.id} style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  {a.number && (
                    <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.74rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                      {a.number}
                    </code>
                  )}
                  <span style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.78rem', color: 'var(--color-text-light)', minWidth: 90 }}>
                    {new Date(a.occurred_on).toLocaleDateString('he-IL')}
                  </span>
                  <strong style={{ fontSize: '0.9rem' }}>{a.action}</strong>
                  {a.performed_by && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>· {a.performed_by}</span>
                  )}
                </div>
                {a.notes && <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)', marginTop: 2, marginInlineStart: 100 }}>{a.notes}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <AttachmentsPanel target={{ malfunctionId: detail.id }} canWrite={canWrite} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-light)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.92rem' }}>{children}</div>
    </div>
  )
}

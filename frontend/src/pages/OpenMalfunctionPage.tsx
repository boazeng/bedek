import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  Malfunctions,
  Projects,
  ProjectTree,
  type Project,
  type ProjectItemNode,
} from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useAlert } from '../components/Dialog'

// Prominent green label, scoped to the "open malfunction" form so the
// shared Field/inputStyle used by other admin screens stays untouched.
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.88rem',
  fontWeight: 700,
  color: 'var(--color-success)',
  marginBottom: 7,
  letterSpacing: '0.01em',
}

const strongInputStyle: React.CSSProperties = {
  width: '100%',
  padding: '11px 13px',
  borderRadius: 9,
  border: '1.5px solid #B7AE9B',
  background: 'var(--color-bg-white)',
  boxShadow: '0 1px 3px rgba(28,27,25,0.10)',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  fontWeight: 500,
  color: 'var(--color-text)',
}

function Field({
  label,
  children,
  hint,
}: {
  label: string
  children: ReactNode
  hint?: string
}) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={labelStyle}>{label}</label>
      {children}
      {hint && (
        <div style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', marginTop: 4 }}>
          {hint}
        </div>
      )}
    </div>
  )
}

const STATUS_OPTIONS = [
  { value: 'pending_manager', label: 'ממתין לאישור' },
  { value: 'todo', label: 'לביצוע' },
  { value: 'negotiation', label: 'מו"מ' },
  { value: 'frozen', label: 'מוקפא' },
]

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'ידני' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'bedek_report', label: 'דוח בדק' },
  { value: 'inspector_tour', label: 'סיור מפקח' },
  { value: 'delivery_protocol', label: 'פרוטוקול מסירה' },
  { value: 'email', label: 'מייל' },
]

const GROUP_OPTIONS = [
  { value: 'unassigned', label: 'טרם נבחר' },
  { value: 'electricity', label: 'חשמל' },
  { value: 'plumbing', label: 'אינסטלציה' },
  { value: 'finishes', label: 'גמרים' },
  { value: 'structure', label: 'שלד' },
  { value: 'protection', label: 'מיגון' },
  { value: 'sealing', label: 'איטום' },
  { value: 'aluminum', label: 'אלומיניום' },
]

type FlatRow = { node: ProjectItemNode; depth: number; pathLabel: string }

function flattenTree(tree: ProjectItemNode[]): FlatRow[] {
  const out: FlatRow[] = []
  function walk(n: ProjectItemNode, depth: number, path: string[]) {
    const here = [...path, n.name]
    out.push({ node: n, depth, pathLabel: here.join(' / ') })
    n.children.forEach((c) => walk(c, depth + 1, here))
  }
  tree.forEach((n) => walk(n, 0, []))
  return out
}

const KIND_ICON: Record<string, string> = {
  building: '🏢',
  floor: '🏬',
  unit: '🏠',
  location: '📍',
}

export default function OpenMalfunctionPage() {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const alert = useAlert()
  const today = new Date().toISOString().slice(0, 10)
  const needsCompany = user?.role === 'super_admin' && !companyId

  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [projectItemId, setProjectItemId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [group, setGroup] = useState('unassigned')
  const [status, setStatus] = useState('pending_manager')
  const [source, setSource] = useState('manual')
  const [professional, setProfessional] = useState('')
  const [openedAt, setOpenedAt] = useState(today)
  const [saving, setSaving] = useState(false)

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
    if (!projectId) {
      setTree([])
      setProjectItemId(null)
      return
    }
    setLoadingTree(true)
    ProjectTree.list(projectId)
      .then((t) => {
        setTree(t)
        setProjectItemId(null)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingTree(false))
  }, [projectId])

  const flat = useMemo(() => flattenTree(tree), [tree])

  function resetForm() {
    setDescription('')
    setGroup('unassigned')
    setStatus('pending_manager')
    setSource('manual')
    setProfessional('')
    setOpenedAt(today)
    setProjectItemId(null)
  }

  async function submit() {
    if (!projectId) {
      alert({ title: 'שגיאה', message: 'יש לבחור פרויקט', variant: 'danger' })
      return
    }
    if (!description.trim()) {
      alert({ title: 'שגיאה', message: 'יש להזין תיאור תקלה', variant: 'danger' })
      return
    }
    setSaving(true)
    try {
      await Malfunctions.create({
        project_id: projectId,
        project_item_id: projectItemId,
        description: description.trim(),
        status,
        source,
        group,
        professional: professional.trim() || null,
        opened_at: openedAt || null,
      })
      alert({ title: 'נשמר', message: 'התקלה נפתחה בהצלחה', variant: 'success' })
      resetForm()
    } catch (e) {
      alert({ title: 'שגיאה', message: String(e), variant: 'danger' })
    } finally {
      setSaving(false)
    }
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לפתוח תקלה</div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 820 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          פתיחת תקלה
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          פתיחת תקלה חדשה ושיוכה לישות בפרויקט
        </div>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      <div
        style={{
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 14,
          padding: '20px 22px',
        }}
      >
        <Field label="פרויקט">
          <select
            style={strongInputStyle}
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
          >
            <option value="">— בחר פרויקט —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="מיקום בפרויקט"
          hint="הישות שאליה משויכת התקלה (בניין / קומה / יחידה / מיקום). ניתן להשאיר ריק לתקלה כללית בפרויקט."
        >
          {loadingTree ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>טוען עץ פרויקט…</div>
          ) : flat.length === 0 ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
              {projectId ? 'אין ישויות בפרויקט זה' : 'בחר פרויקט תחילה'}
            </div>
          ) : (
            <select
              style={strongInputStyle}
              value={projectItemId ?? ''}
              onChange={(e) => setProjectItemId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— כללי לפרויקט —</option>
              {flat.map(({ node, depth, pathLabel }) => (
                <option key={node.id} value={node.id}>
                  {' '.repeat(depth * 3)}
                  {KIND_ICON[node.kind] || '•'} {pathLabel}
                  {node.short_code ? `  ·  ${node.short_code}` : ''}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="תיאור התקלה">
          <textarea
            style={{ ...strongInputStyle, minHeight: 90, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='למשל: "סדק בקיר הסלון", "ברז דולף במטבח"'
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="קבוצה">
            <select style={strongInputStyle} value={group} onChange={(e) => setGroup(e.target.value)}>
              {GROUP_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
          <Field label="סטטוס">
            <select style={strongInputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="בעל מקצוע">
            <input
              style={strongInputStyle}
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
              placeholder="חשמלאי / אינסטלטור / ..."
            />
          </Field>
          <Field label="מקור">
            <select style={strongInputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="תאריך פתיחה">
          <input
            type="date"
            style={strongInputStyle}
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 6 }}>
          <button
            type="button"
            onClick={resetForm}
            className="tact-btn tact-btn-ghost"
            disabled={saving}
          >
            נקה
          </button>
          <button
            type="button"
            onClick={submit}
            className="tact-btn tact-btn-primary"
            disabled={saving || !projectId}
          >
            {saving ? 'שומר…' : 'פתח תקלה'}
          </button>
        </div>
      </div>
    </div>
  )
}

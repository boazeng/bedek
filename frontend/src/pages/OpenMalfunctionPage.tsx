import { useEffect, useMemo, useState, type ReactNode } from 'react'
import {
  CompanyProfessionals,
  Locations,
  Malfunctions,
  Projects,
  ProjectTree,
  type CompanyProfessionalRow,
  type LocationRow,
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

const UNIT_TYPE_LABEL: Record<string, string> = {
  apartment: 'דירה',
  parking: 'חניה',
  storage: 'מחסן',
  shop: 'חנות',
  public_area: 'ציבורי',
}

export default function OpenMalfunctionPage() {
  const { user, activeProject, workScope } = useAuth()
  const companyId = useEffectiveCompanyId()
  const alert = useAlert()
  const today = new Date().toISOString().slice(0, 10)
  const needsCompany = user?.role === 'super_admin' && !companyId

  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [loadingTree, setLoadingTree] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [buildingId, setBuildingId] = useState<number | null>(null)
  const [entranceId, setEntranceId] = useState<number | null>(null)
  const [unitId, setUnitId] = useState<number | null>(null)
  const [locationId, setLocationId] = useState<number | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [trades, setTrades] = useState<CompanyProfessionalRow[]>([])
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('pending_manager')
  const [source, setSource] = useState('manual')
  const [professional, setProfessional] = useState('')
  const [openedAt, setOpenedAt] = useState(today)
  const [saving, setSaving] = useState(false)

  // Repair activities (how the defect was handled) — built locally, saved with
  // the defect on submit. Each: date · description · who performed.
  type ActivityRow = { occurred_on: string; action: string; performed_by: string }
  const [activities, setActivities] = useState<ActivityRow[]>([])
  const addActivityRow = () =>
    setActivities((a) => [...a, { occurred_on: today, action: '', performed_by: '' }])
  const updateActivityRow = (i: number, patch: Partial<ActivityRow>) =>
    setActivities((a) => a.map((row, idx) => (idx === i ? { ...row, ...patch } : row)))
  const removeActivityRow = (i: number) =>
    setActivities((a) => a.filter((_, idx) => idx !== i))

  useEffect(() => {
    if (needsCompany) return
    const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined
    Projects.list(cid)
      .then((p) => {
        setProjects(p)
        if (p.length && !projectId) {
          // Prefer the project the user is actively working on.
          const active = activeProject && p.find((x) => x.id === activeProject.id)
          setProjectId(active ? active.id : p[0].id)
        }
      })
      .catch((e) => setError(String(e)))
    Locations.list(cid)
      .then(setLocations)
      .catch(() => setLocations([]))
    CompanyProfessionals.list(cid)
      .then((rows) => setTrades(rows.filter((r) => r.is_active)))
      .catch(() => setTrades([]))
  }, [user?.role, companyId])

  useEffect(() => {
    if (!projectId) {
      setTree([])
      setBuildingId(null)
      setEntranceId(null)
      setUnitId(null)
      return
    }
    setLoadingTree(true)
    ProjectTree.list(projectId)
      .then((t) => {
        setTree(t)
        // Prefill from the global work scope when it matches this project.
        if (activeProject && projectId === activeProject.id && workScope.buildingId) {
          setBuildingId(workScope.buildingId)
          setEntranceId(workScope.entranceId)
          setUnitId(workScope.unitId)
        } else {
          setBuildingId(null)
          setEntranceId(null)
          setUnitId(null)
        }
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingTree(false))
  }, [projectId])

  // Cascading drill-down: building → entrance → unit.
  const buildings = useMemo(() => tree.filter((n) => n.kind === 'building'), [tree])
  const entrances = useMemo(() => {
    const b = buildings.find((x) => x.id === buildingId)
    return b ? b.children.filter((n) => n.kind === 'entrance') : []
  }, [buildings, buildingId])
  const units = useMemo(() => {
    const b = buildings.find((x) => x.id === buildingId)
    const e = b?.children.find((x) => x.id === entranceId)
    if (!e) return [] as { node: ProjectItemNode; floor: string }[]
    const out: { node: ProjectItemNode; floor: string }[] = []
    for (const floor of e.children) {
      for (const u of floor.children) {
        if (u.kind === 'unit') out.push({ node: u, floor: floor.name })
      }
    }
    return out
  }, [buildings, buildingId, entranceId])

  // Most specific chosen node is what the defect attaches to.
  const effectiveItemId = unitId ?? entranceId ?? buildingId

  function resetForm() {
    setDescription('')
    setStatus('pending_manager')
    setSource('manual')
    setProfessional('')
    setOpenedAt(today)
    setBuildingId(null)
    setEntranceId(null)
    setUnitId(null)
    setLocationId(null)
    setActivities([])
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
      const created = await Malfunctions.create({
        project_id: projectId,
        project_item_id: effectiveItemId,
        location_id: locationId,
        description: description.trim(),
        status,
        source,
        group: 'unassigned',
        professional: professional.trim() || null,
        opened_at: openedAt || null,
      })
      // Persist the repair activities under the new defect.
      for (const act of activities) {
        if (!act.action.trim()) continue
        await Malfunctions.addActivity(created.id, {
          occurred_on: act.occurred_on || null,
          action: act.action.trim(),
          performed_by: act.performed_by.trim() || null,
        })
      }
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
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
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
          <Field label="תאריך פתיחה">
            <input
              type="date"
              style={strongInputStyle}
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </Field>
        </div>

        {loadingTree ? (
          <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 16 }}>
            טוען עץ פרויקט…
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
            <Field label="בניין">
              <select
                style={strongInputStyle}
                value={buildingId ?? ''}
                onChange={(e) => {
                  setBuildingId(e.target.value ? Number(e.target.value) : null)
                  setEntranceId(null)
                  setUnitId(null)
                }}
              >
                <option value="">— בחר בניין —</option>
                {buildings.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="כניסה">
              <select
                style={strongInputStyle}
                value={entranceId ?? ''}
                disabled={!buildingId}
                onChange={(e) => {
                  setEntranceId(e.target.value ? Number(e.target.value) : null)
                  setUnitId(null)
                }}
              >
                <option value="">— בחר כניסה —</option>
                {entrances.map((en) => (
                  <option key={en.id} value={en.id}>
                    {en.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="יחידה" hint="דירה / חניה / מחסן / חנות / ציבורי">
              <select
                style={strongInputStyle}
                value={unitId ?? ''}
                disabled={!entranceId}
                onChange={(e) => setUnitId(e.target.value ? Number(e.target.value) : null)}
              >
                <option value="">— כל הכניסה —</option>
                {units.map(({ node, floor }) => (
                  <option key={node.id} value={node.id}>
                    {UNIT_TYPE_LABEL[node.unit_type || ''] || 'יחידה'} {node.short_code || node.number || ''} · {floor}
                  </option>
                ))}
              </select>
            </Field>
          </div>
        )}

        <Field label="תיאור התקלה">
          <textarea
            style={{ ...strongInputStyle, minHeight: 90, resize: 'vertical' }}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder='למשל: "סדק בקיר הסלון", "ברז דולף במטבח"'
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="מקצוע" hint="מתוך סיווגי בעלי המקצוע של החברה (ניהול חברה ← סיווגי בעלי מקצוע)">
            <select
              style={strongInputStyle}
              value={professional}
              onChange={(e) => setProfessional(e.target.value)}
            >
              <option value="">— בחר מקצוע —</option>
              {trades.map((t) => (
                <option key={t.id} value={t.name}>
                  {t.name}
                </option>
              ))}
            </select>
          </Field>
          <Field label="מיקום">
            <select
              style={strongInputStyle}
              value={locationId ?? ''}
              onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">— ללא מיקום —</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="סטטוס">
            <select style={strongInputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
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

        <div style={{ marginTop: 4, borderTop: '1px solid var(--color-border)', paddingTop: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <label style={labelStyle}>פעילויות תיקון — כיצד טופלה התקלה</label>
            <button
              type="button"
              onClick={addActivityRow}
              className="tact-btn tact-btn-ghost"
              style={{ padding: '5px 12px', fontSize: '0.8rem' }}
            >
              + הוסף פעילות
            </button>
          </div>
          {activities.length === 0 ? (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-light)' }}>
              עדיין אין פעילויות. לחץ "+ הוסף פעילות" כדי לתעד כיצד טופלה התקלה.
            </div>
          ) : (
            activities.map((act, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '150px 1fr 170px 34px',
                  gap: 8,
                  marginBottom: 8,
                  alignItems: 'center',
                }}
              >
                <input
                  type="date"
                  style={strongInputStyle}
                  value={act.occurred_on}
                  onChange={(e) => updateActivityRow(i, { occurred_on: e.target.value })}
                />
                <input
                  style={strongInputStyle}
                  placeholder="תיאור הפעילות"
                  value={act.action}
                  onChange={(e) => updateActivityRow(i, { action: e.target.value })}
                />
                <input
                  style={strongInputStyle}
                  placeholder="מי ביצע"
                  value={act.performed_by}
                  onChange={(e) => updateActivityRow(i, { performed_by: e.target.value })}
                />
                <button
                  type="button"
                  onClick={() => removeActivityRow(i)}
                  className="tact-btn tact-btn-ghost"
                  title="מחק פעילות"
                  style={{ padding: '6px', fontSize: '0.85rem', color: 'var(--color-accent)' }}
                >
                  ✕
                </button>
              </div>
            ))
          )}
        </div>

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

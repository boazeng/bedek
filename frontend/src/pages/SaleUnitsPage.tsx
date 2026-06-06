import { useEffect, useMemo, useState } from 'react'
import { Projects, SaleUnits, type Project, type SaleUnit } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useConfirm } from '../components/Dialog'

const UNIT_TYPES: Array<{ value: string; label: string }> = [
  { value: 'apartment', label: 'דירה' },
  { value: 'parking', label: 'חניה' },
  { value: 'storage', label: 'מחסן' },
  { value: 'shop', label: 'חנות' },
  { value: 'public_area', label: 'שטח ציבורי' },
]

const UNIT_TYPE_LABEL: Record<string, string> = Object.fromEntries(
  UNIT_TYPES.map((t) => [t.value, t.label]),
)

type FormState = {
  project_id: number | null
  unit_type: string
  unit_number: string
  entrance: string
  floor: string
}

const EMPTY_FORM: FormState = {
  project_id: null,
  unit_type: 'apartment',
  unit_number: '',
  entrance: '',
  floor: '',
}

export default function SaleUnitsPage() {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const confirm = useConfirm()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin'
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [rows, setRows] = useState<SaleUnit[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SaleUnit | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const needsCompany = user?.role === 'super_admin' && !companyId
  const currentProject = useMemo(
    () => projects.find((p) => p.id === projectId),
    [projects, projectId],
  )

  useEffect(() => {
    if (needsCompany) return
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then((p) => {
        setProjects(p)
        if (p.length && !projectId) setProjectId(p[0].id)
      })
      .catch((e) => setError(String(e)))
  }, [user?.role, companyId])

  function loadUnits() {
    if (!projectId) {
      setRows([])
      return
    }
    setLoading(true)
    SaleUnits.list(projectId)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(loadUnits, [projectId])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, project_id: projectId })
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(u: SaleUnit) {
    setEditing(u)
    setForm({
      project_id: u.project_id,
      unit_type: u.unit_type,
      unit_number: u.unit_number,
      entrance: u.entrance || '',
      floor: u.floor || '',
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    if (!form.project_id) {
      setSaveErr('בחר פרויקט')
      return
    }
    const payload: Partial<SaleUnit> = {
      project_id: form.project_id,
      unit_type: form.unit_type,
      unit_number: form.unit_number,
      entrance: form.entrance || null,
      floor: form.floor || null,
    }
    try {
      if (editing) await SaleUnits.update(editing.id, payload)
      else await SaleUnits.create(payload)
      setOpen(false)
      loadUnits()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(u: SaleUnit) {
    const ok = await confirm({
      title: 'מחיקת יחידה',
      message: `למחוק ${UNIT_TYPE_LABEL[u.unit_type]} מס' ${u.unit_number}?`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await SaleUnits.remove(u.id)
    loadUnits()
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לנהל יחידות ממכר</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            יחידות ממכר
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            דירות, חניות, מחסנים, חנויות, שטחים ציבוריים — בכל פרויקט
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
          >
            <option value="">— בחר פרויקט —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          {isAdmin && projectId && (
            <button onClick={openCreate} className="tact-btn tact-btn-primary">
              + יחידה חדשה
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}
      {!projectId ? (
        <div className="tact-kpi" style={{ textAlign: 'center' }}>
          <div className="tact-kpi-label">בחר פרויקט להצגת היחידות</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: 'סוג', key: 'unit_type', render: (r) => UNIT_TYPE_LABEL[r.unit_type] || r.unit_type },
            { header: 'מספר', key: 'unit_number' },
            { header: 'כניסה', key: 'entrance' },
            { header: 'קומה', key: 'floor' },
          ]}
          actions={
            isAdmin
              ? (r) => (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => openEdit(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                      ערוך
                    </button>
                    <button onClick={() => remove(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                      מחק
                    </button>
                  </div>
                )
              : undefined
          }
          empty={currentProject ? `אין יחידות בפרויקט "${currentProject.name}"` : 'אין יחידות'}
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת יחידה' : 'יחידה חדשה'}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="tact-btn tact-btn-ghost" onClick={() => setOpen(false)}>
              ביטול
            </button>
            <button className="tact-btn tact-btn-primary" onClick={save}>
              שמור
            </button>
          </>
        }
      >
        <Field label="פרויקט">
          <select
            style={inputStyle}
            value={form.project_id ?? ''}
            onChange={(e) =>
              setForm({ ...form, project_id: e.target.value ? Number(e.target.value) : null })
            }
          >
            <option value="">— בחר —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="סוג יחידה">
          <select
            style={inputStyle}
            value={form.unit_type}
            onChange={(e) => setForm({ ...form, unit_type: e.target.value })}
          >
            {UNIT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="מספר יחידה">
          <input style={inputStyle} value={form.unit_number} onChange={(e) => setForm({ ...form, unit_number: e.target.value })} />
        </Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="כניסה">
            <input style={inputStyle} value={form.entrance} onChange={(e) => setForm({ ...form, entrance: e.target.value })} />
          </Field>
          <Field label="קומה">
            <input style={inputStyle} value={form.floor} onChange={(e) => setForm({ ...form, floor: e.target.value })} />
          </Field>
        </div>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

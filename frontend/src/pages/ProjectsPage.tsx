import { useEffect, useState } from 'react'
import { Crm, Projects, type Project } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useAlert, useConfirm } from '../components/Dialog'

type FormState = Pick<Project, 'name' | 'address' | 'project_manager' | 'site_manager'>

const EMPTY_FORM: FormState = {
  name: '',
  address: '',
  project_manager: '',
  site_manager: '',
}

export default function ProjectsPage() {
  const { user, activeProject, setActiveProject } = useAuth()
  const companyId = useEffectiveCompanyId()
  const confirm = useConfirm()
  const alert = useAlert()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin'
  const [syncing, setSyncing] = useState(false)
  const cidParam = user?.role === 'super_admin' ? companyId ?? undefined : undefined
  const [rows, setRows] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Project | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  const needsCompany = user?.role === 'super_admin' && !companyId

  function load() {
    if (needsCompany) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [user?.role, companyId])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(p: Project) {
    setEditing(p)
    setForm({
      name: p.name,
      address: p.address || '',
      project_manager: p.project_manager || '',
      site_manager: p.site_manager || '',
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    const payload: Partial<Project> = {
      ...form,
      company_id: user?.role === 'super_admin' ? companyId ?? undefined : undefined,
    }
    try {
      if (editing) await Projects.update(editing.id, payload)
      else await Projects.create(payload)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function syncFromCrm() {
    setSyncing(true)
    try {
      const res = await Crm.syncProjects(cidParam)
      await alert({
        title: 'סנכרון מ-CRM הושלם',
        message: `נוצרו: ${res.created} · עודכנו: ${res.updated} · סה״כ ב-CRM: ${res.total}`,
        variant: 'success',
      })
      load()
    } catch (e) {
      alert({ title: 'שגיאת סנכרון', message: String(e), variant: 'danger' })
    } finally {
      setSyncing(false)
    }
  }

  async function remove(p: Project) {
    const ok = await confirm({
      title: 'מחיקת פרויקט',
      message: `למחוק את הפרויקט "${p.name}"? פעולה בלתי הפיכה — כל הנתונים המקושרים יימחקו.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await Projects.remove(p.id)
    load()
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לנהל פרויקטים</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            ניהול פרויקטים
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            פרויקטי בניה של החברה
          </div>
        </div>
        {isAdmin && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={syncFromCrm}
              className="tact-btn tact-btn-ghost"
              disabled={syncing}
              title="ייבא/עדכן את פרויקטי הבדק של החברה מ-TACT-CRM"
            >
              {syncing ? 'מסנכרן…' : '⟳ סנכרון מ-CRM'}
            </button>
            <button onClick={openCreate} className="tact-btn tact-btn-primary">
              + פרויקט חדש
            </button>
          </div>
        )}
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: 'שם הפרויקט',
              key: 'name',
              render: (r) => (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                  {r.name}
                  {r.crm_external_id && (
                    <span className="tact-badge tact-badge-on" title="פרויקט מסונכרן מ-TACT-CRM">
                      מ-CRM
                    </span>
                  )}
                </span>
              ),
            },
            { header: 'כתובת', key: 'address' },
            { header: 'מנהל פרויקט', key: 'project_manager' },
            { header: 'מנהל עבודה', key: 'site_manager' },
          ]}
          actions={(r) => {
            const selected = activeProject?.id === r.id
            return (
              <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                <button
                  onClick={() =>
                    setActiveProject(selected ? null : { id: r.id, name: r.name })
                  }
                  className={selected ? 'tact-btn tact-btn-primary' : 'tact-btn tact-btn-ghost'}
                  style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                  title={selected ? 'הפרויקט הפעיל — לחץ לביטול הבחירה' : 'בחר פרויקט זה כפרויקט פעיל'}
                >
                  {selected ? '✓ נבחר' : 'בחר'}
                </button>
                {isAdmin && (
                  <>
                    <button
                      onClick={() => window.open(`/projects/edit/${r.id}`, '_blank', 'noopener')}
                      className="tact-btn tact-btn-primary"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                      title="פתח את הפרויקט בלשונית מלאה"
                    >
                      פתח
                    </button>
                    <button onClick={() => openEdit(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem' }} title="עריכת פרטי הפרויקט">
                      פרטים
                    </button>
                    <button onClick={() => remove(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--color-accent)' }}>
                      מחק
                    </button>
                  </>
                )}
              </div>
            )
          }}
          empty="עדיין אין פרויקטים."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת פרויקט' : 'פרויקט חדש'}
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
        <Field label="שם הפרויקט">
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="כתובת">
          <input style={inputStyle} value={form.address || ''} onChange={(e) => setForm({ ...form, address: e.target.value })} />
        </Field>
        <Field label="מנהל פרויקט">
          <input style={inputStyle} value={form.project_manager || ''} onChange={(e) => setForm({ ...form, project_manager: e.target.value })} />
        </Field>
        <Field label="מנהל עבודה">
          <input style={inputStyle} value={form.site_manager || ''} onChange={(e) => setForm({ ...form, site_manager: e.target.value })} />
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

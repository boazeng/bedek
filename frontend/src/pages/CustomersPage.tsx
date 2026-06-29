import { useEffect, useState } from 'react'
import { Buyers, type Buyer } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useConfirm } from '../components/Dialog'

type FormState = { name: string; nickname: string; phone: string }
const EMPTY_FORM: FormState = { name: '', nickname: '', phone: '' }

export default function CustomersPage() {
  const { user, activeProject } = useAuth()
  const companyId = useEffectiveCompanyId()
  const confirm = useConfirm()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin'
  const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined

  const [rows, setRows] = useState<Buyer[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<Buyer | null>(null)
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
    Buyers.list({ companyId: cid, projectId: activeProject?.id })
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [user?.role, companyId, activeProject?.id])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(b: Buyer) {
    setEditing(b)
    setForm({ name: b.name, nickname: b.nickname || '', phone: b.phone || '' })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    if (!form.name.trim()) {
      setSaveErr('נא להזין שם לקוח')
      return
    }
    const body = {
      name: form.name.trim(),
      nickname: form.nickname.trim() || null,
      phone: form.phone.trim() || null,
      project_id: activeProject?.id ?? null,
    }
    try {
      if (editing) await Buyers.update(editing.id, body)
      else await Buyers.create(body, cid)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(b: Buyer) {
    const ok = await confirm({
      title: 'מחיקת לקוח',
      message: `למחוק את הלקוח "${b.name}"?`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await Buyers.remove(b.id)
    load()
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לנהל לקוחות</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            לקוחות
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            {activeProject
              ? `לקוחות הפרויקט "${activeProject.name}"`
              : 'כל לקוחות החברה — בחר פרויקט פעיל כדי לסנן לפי פרויקט'}
          </div>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="tact-btn tact-btn-primary">
            + לקוח חדש
          </button>
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
            { header: 'מס׳ לקוח', key: 'id', width: 90 },
            { header: 'שם הלקוח', key: 'name' },
            { header: 'כינוי', key: 'nickname', render: (r) => r.nickname || '—' },
            { header: 'טלפון', key: 'phone', render: (r) => r.phone || '—' },
          ]}
          actions={
            isAdmin
              ? (r) => (
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => openEdit(r)}
                      className="tact-btn tact-btn-ghost"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      עריכה
                    </button>
                    <button
                      onClick={() => remove(r)}
                      className="tact-btn tact-btn-ghost"
                      style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--color-accent)' }}
                    >
                      מחק
                    </button>
                  </div>
                )
              : undefined
          }
          empty={activeProject ? 'אין עדיין לקוחות לפרויקט זה.' : 'אין עדיין לקוחות.'}
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת לקוח' : 'לקוח חדש'}
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
        <Field label="שם הלקוח">
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="כינוי">
          <input style={inputStyle} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </Field>
        <Field label="טלפון">
          <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        {!activeProject && (
          <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
            לא נבחר פרויקט — הלקוח יישמר לחברה ללא שיוך לפרויקט.
          </div>
        )}
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

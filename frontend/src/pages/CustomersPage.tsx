import { useEffect, useState } from 'react'
import { Crm, type CrmCustomer } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'

type FormState = { full_name: string; nickname: string; phone: string; customer_number: string }
const EMPTY_FORM: FormState = { full_name: '', nickname: '', phone: '', customer_number: '' }

/** Customers (לקוחות) live in TACT-CRM (system of record). This page reads them
 *  from CRM and writes new/edited customers back to CRM. */
export default function CustomersPage() {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const isAdmin = user?.role === 'super_admin' || user?.role === 'company_admin'
  const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined

  const [rows, setRows] = useState<CrmCustomer[]>([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CrmCustomer | null>(null)
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
    setError(null)
    Crm.customers({ companyId: cid, search: search.trim() || undefined })
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
  function openEdit(c: CrmCustomer) {
    setEditing(c)
    setForm({
      full_name: c.full_name,
      nickname: c.nickname || '',
      phone: c.phone || '',
      customer_number: c.customer_number || '',
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    if (!form.full_name.trim()) {
      setSaveErr('נא להזין שם לקוח')
      return
    }
    const body = {
      full_name: form.full_name.trim(),
      nickname: form.nickname.trim() || null,
      phone: form.phone.trim() || null,
      customer_number: form.customer_number.trim() || null,
    }
    try {
      if (editing) await Crm.updateCustomer(editing.membership_id, body, cid)
      else await Crm.createCustomer(body, cid)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
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
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            לקוחות
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            לקוחות החברה מתוך TACT-CRM — השיוך לפרויקט ולדירה נעשה בבונה המבנה
          </div>
        </div>
        {isAdmin && (
          <button onClick={openCreate} className="tact-btn tact-btn-primary" style={{ alignSelf: 'flex-start' }}>
            + לקוח חדש
          </button>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
        <input
          style={{ ...inputStyle, maxWidth: 320 }}
          value={search}
          placeholder="חיפוש לפי שם / מספר…"
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && load()}
        />
        <button className="tact-btn tact-btn-ghost" onClick={load}>
          חיפוש
        </button>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.membership_id}
          columns={[
            { header: 'מס׳ לקוח', key: 'customer_number', render: (r) => r.customer_number || r.membership_id },
            { header: 'שם הלקוח', key: 'full_name' },
            { header: 'כינוי', key: 'nickname', render: (r) => r.nickname || '—' },
            { header: 'טלפון', key: 'phone', render: (r) => r.phone || '—' },
          ]}
          actions={
            isAdmin
              ? (r) => (
                  <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => openEdit(r)}
                      className="tact-btn tact-btn-ghost"
                      style={{ padding: '6px 12px', fontSize: '0.78rem' }}
                    >
                      עריכה
                    </button>
                  </div>
                )
              : undefined
          }
          empty="אין לקוחות להצגה."
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
              שמור ל-CRM
            </button>
          </>
        }
      >
        <Field label="שם הלקוח">
          <input style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="כינוי">
          <input style={inputStyle} value={form.nickname} onChange={(e) => setForm({ ...form, nickname: e.target.value })} />
        </Field>
        <Field label="טלפון">
          <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="מספר לקוח (אופציונלי)">
          <input style={inputStyle} value={form.customer_number} onChange={(e) => setForm({ ...form, customer_number: e.target.value })} />
        </Field>
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
          הלקוח נשמר ב-TACT-CRM (מקור האמת ללקוחות).
        </div>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

import { useEffect, useState } from 'react'
import { Companies, type Company } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useConfirm } from '../components/Dialog'

type FormState = Omit<Company, 'id' | 'created_at'>

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  contact_email: '',
  phone: '',
  is_active: true,
}

export default function CompaniesPage() {
  const confirm = useConfirm()
  const [rows, setRows] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Company | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [open, setOpen] = useState(false)
  const [saveErr, setSaveErr] = useState<string | null>(null)

  function load() {
    setLoading(true)
    Companies.list()
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(c: Company) {
    setEditing(c)
    setForm({
      name: c.name,
      slug: c.slug,
      contact_email: c.contact_email || '',
      phone: c.phone || '',
      is_active: c.is_active,
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    try {
      if (editing) await Companies.update(editing.id, form)
      else await Companies.create(form)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(c: Company) {
    const ok = await confirm({
      title: 'השבתת חברה',
      message: `להשבית את החברה "${c.name}"? הסטטוס יסומן כלא פעיל (לא נמחק).`,
      variant: 'danger',
      confirmLabel: 'השבת',
    })
    if (!ok) return
    await Companies.remove(c.id)
    load()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            ניהול חברות
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            יצירה, עריכה והשבתה של חברות-לקוח
          </div>
        </div>
        <button onClick={openCreate} className="tact-btn tact-btn-primary">
          + חברה חדשה
        </button>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: 'שם', key: 'name' },
            { header: 'מזהה (slug)', key: 'slug', render: (r) => <code style={{ fontFamily: 'var(--font-family-en)' }}>{r.slug}</code> },
            { header: 'איש קשר', key: 'contact_email' },
            { header: 'טלפון', key: 'phone' },
            {
              header: 'סטטוס',
              key: 'is_active',
              render: (r) => (
                <span className={`tact-badge ${r.is_active ? 'tact-badge-pos' : 'tact-badge-soon'}`}>
                  {r.is_active ? 'פעיל' : 'לא פעיל'}
                </span>
              ),
            },
          ]}
          actions={(r) => (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => openEdit(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                ערוך
              </button>
              <button onClick={() => remove(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                השבת
              </button>
            </div>
          )}
          empty="עדיין אין חברות. לחץ '+ חברה חדשה' להתחיל."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת חברה' : 'חברה חדשה'}
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
        <Field label="שם החברה">
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </Field>
        <Field label="מזהה (slug, אנגלית)" hint="לדוגמה: demo, bnb. ישמש בכתובות פנימיות בלבד.">
          <input
            style={inputStyle}
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
        </Field>
        <Field label="מייל ליצירת קשר">
          <input
            style={inputStyle}
            value={form.contact_email || ''}
            onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
          />
        </Field>
        <Field label="טלפון">
          <input
            style={inputStyle}
            value={form.phone || ''}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </Field>
        <Field label="סטטוס">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>פעיל</span>
          </label>
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

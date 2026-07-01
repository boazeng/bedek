import { useEffect, useState } from 'react'
import { Companies, Crm, type Company } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAlert, useConfirm } from '../components/Dialog'

type FormState = Omit<Company, 'id' | 'created_at'>

const EMPTY_FORM: FormState = {
  name: '',
  slug: '',
  contact_email: '',
  phone: '',
  is_active: true,
  crm_company_id: null,
}

export default function CompaniesPage() {
  const confirm = useConfirm()
  const alert = useAlert()
  const [syncing, setSyncing] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [loadingCrm, setLoadingCrm] = useState(false)
  const [crmList, setCrmList] = useState<
    { id: number; name: string; company_number: number | null; linked: boolean }[]
  >([])
  const [selected, setSelected] = useState<Set<number>>(new Set())
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
      crm_company_id: c.crm_company_id ?? null,
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

  async function openPicker() {
    setPickerOpen(true)
    setLoadingCrm(true)
    setSelected(new Set())
    try {
      setCrmList(await Crm.companies())
    } catch (e) {
      setPickerOpen(false)
      alert({ title: 'שגיאה', message: `לא ניתן לטעון חברות מ-CRM: ${String(e)}`, variant: 'danger' })
    } finally {
      setLoadingCrm(false)
    }
  }
  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }
  async function importSelected() {
    if (selected.size === 0) return
    setSyncing(true)
    try {
      const res = await Crm.importCompanies([...selected])
      setPickerOpen(false)
      await alert({
        title: 'ייבוא חברות הושלם',
        message:
          `חברות — נוצרו: ${res.created} · עודכנו: ${res.updated}${res.skipped ? ` · דולגו: ${res.skipped}` : ''}\n` +
          `פרויקטים — נוצרו: ${res.projects_created} · עודכנו: ${res.projects_updated}`,
        variant: 'success',
      })
      load()
    } catch (e) {
      alert({ title: 'שגיאת ייבוא', message: String(e), variant: 'danger' })
    } finally {
      setSyncing(false)
    }
  }

  async function remove(c: Company) {
    const ok = await confirm({
      title: 'מחיקת חברה',
      message: `למחוק לצמיתות את החברה "${c.name}"? כל הפרויקטים והתקלות שלה יימחקו יחד איתה. פעולה בלתי הפיכה.`,
      variant: 'danger',
      confirmLabel: 'מחק לצמיתות',
    })
    if (!ok) return
    try {
      await Companies.remove(c.id)
      load()
    } catch (e) {
      setError(String(e))
    }
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
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={openPicker}
            className="tact-btn tact-btn-ghost"
            title="בחר אילו חברות לייבא מ-TACT-CRM"
          >
            + הוסף חברות מ-CRM
          </button>
          <button onClick={openCreate} className="tact-btn tact-btn-primary">
            + חברה חדשה
          </button>
        </div>
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
            {
              header: 'מקור',
              key: 'crm_company_id',
              render: (r) =>
                r.crm_company_id ? (
                  <span className="tact-badge tact-badge-on" title={`CRM company ${r.crm_company_id}`}>
                    מ-CRM
                  </span>
                ) : (
                  <span style={{ color: 'var(--color-text-light)', fontSize: '0.8rem' }}>מקומי</span>
                ),
            },
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
                מחק
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
        <Field
          label="מזהה חברה ב-CRM"
          hint="הקישור ל-TACT-CRM. כשמוגדר — אפשר לסנכרן את פרויקטי הבדק של החברה מ-CRM. ריק = אין קישור."
        >
          <input
            type="number"
            style={inputStyle}
            value={form.crm_company_id ?? ''}
            onChange={(e) =>
              setForm({ ...form, crm_company_id: e.target.value ? Number(e.target.value) : null })
            }
            placeholder="למשל: 2"
          />
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>

      <Modal
        open={pickerOpen}
        title="הוספת חברות מ-TACT-CRM"
        onClose={() => setPickerOpen(false)}
        footer={
          <>
            <button className="tact-btn tact-btn-ghost" onClick={() => setPickerOpen(false)}>
              ביטול
            </button>
            <button
              className="tact-btn tact-btn-primary"
              onClick={importSelected}
              disabled={syncing || selected.size === 0}
            >
              {syncing ? 'מייבא…' : `הוסף (${selected.size})`}
            </button>
          </>
        }
      >
        <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)', marginBottom: 10 }}>
          סמן את החברות הרלוונטיות לבדק. חברות שכבר מקושרות מסומנות כ"מקושר".
        </div>
        {loadingCrm ? (
          <div style={{ color: 'var(--color-text-light)' }}>טוען חברות מ-CRM…</div>
        ) : crmList.length === 0 ? (
          <div style={{ color: 'var(--color-text-light)' }}>אין חברות ב-CRM.</div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 360, overflowY: 'auto' }}>
            {crmList.map((c) => (
              <label
                key={c.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '8px 10px',
                  borderRadius: 8,
                  border: '1px solid var(--color-border)',
                  background: 'var(--color-bg)',
                  cursor: c.linked ? 'default' : 'pointer',
                  opacity: c.linked ? 0.6 : 1,
                }}
              >
                <input
                  type="checkbox"
                  disabled={c.linked}
                  checked={c.linked || selected.has(c.id)}
                  onChange={() => toggleSelect(c.id)}
                />
                <span style={{ flex: 1, fontSize: '0.9rem' }}>{c.name}</span>
                {c.company_number != null && (
                  <span
                    className="tact-badge"
                    style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.72rem' }}
                    title="מספר חברה ב-CRM"
                  >
                    {c.company_number}
                  </span>
                )}
                <span style={{ fontSize: '0.72rem', color: 'var(--color-text-light)', fontFamily: 'var(--font-family-en)' }}>
                  #{c.id}
                </span>
                {c.linked && <span className="tact-badge tact-badge-on">מקושר</span>}
              </label>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}

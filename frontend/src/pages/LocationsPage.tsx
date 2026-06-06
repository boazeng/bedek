import { useEffect, useState } from 'react'
import { Locations, type LocationRow } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useAlert, useConfirm } from '../components/Dialog'

type FormState = Pick<LocationRow, 'name' | 'applies_to_public_only' | 'sort_order'>

const EMPTY_FORM: FormState = {
  name: '',
  applies_to_public_only: false,
  sort_order: 0,
}

const arrowBtnStyle = (enabled: boolean): React.CSSProperties => ({
  width: 22,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  cursor: enabled ? 'pointer' : 'not-allowed',
  color: enabled ? 'var(--color-primary)' : 'var(--color-text-light)',
  opacity: enabled ? 1 : 0.35,
  fontFamily: 'inherit',
  fontSize: '0.62rem',
  padding: 0,
  lineHeight: 1,
})

export default function LocationsPage() {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const confirm = useConfirm()
  const alert = useAlert()
  const [importing, setImporting] = useState(false)
  const [rows, setRows] = useState<LocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<LocationRow | null>(null)
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
    Locations.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [user?.role, companyId])

  function openCreate() {
    setEditing(null)
    setForm({ ...EMPTY_FORM, sort_order: rows.length })
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(l: LocationRow) {
    setEditing(l)
    setForm({
      name: l.name,
      applies_to_public_only: l.applies_to_public_only,
      sort_order: l.sort_order,
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    try {
      if (editing) await Locations.update(editing.id, form)
      else
        await Locations.create(
          form,
          user?.role === 'super_admin' ? companyId ?? undefined : undefined,
        )
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function importFromSystem() {
    const ok = await confirm({
      title: 'יבוא ממיקומי מערכת',
      message:
        'הקטלוג הקיים של החברה יימחק לחלוטין ויוחלף ברשימת מיקומי המערכת ' +
        'הפעילים (לפי הסדר שלהם). פעולה זו לא ניתנת לביטול. להמשיך?',
      variant: 'danger',
      confirmLabel: 'יבא והחלף',
    })
    if (!ok) return
    setImporting(true)
    try {
      const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined
      const summary = await Locations.importFromSystem(cid)
      await alert({
        title: 'היבוא הסתיים',
        message: `נטענו ממיקומי מערכת: ${summary.added}\nנמחקו (קטלוג קודם): ${summary.deleted}`,
        variant: 'success',
      })
      load()
    } catch (e) {
      alert({ title: 'שגיאת יבוא', message: String(e), variant: 'danger' })
    } finally {
      setImporting(false)
    }
  }

  async function remove(l: LocationRow) {
    const ok = await confirm({
      title: 'מחיקת מיקום',
      message: `למחוק את המיקום "${l.name}"? פעולה זו לא ניתנת לביטול.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await Locations.remove(l.id)
    load()
  }

  const [moving, setMoving] = useState(false)
  async function move(loc: LocationRow, dir: 'up' | 'down') {
    if (moving) return
    const idx = rows.findIndex((r) => r.id === loc.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return

    // Compute the new desired order by swapping the two adjacent rows.
    const newOrder = [...rows]
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    const orderedIds = newOrder.map((r) => r.id)

    setMoving(true)
    try {
      // Single atomic reorder — renumbers every row to 0,1,2,… on the server.
      // Robust against duplicate or non-contiguous sort_order values.
      await Locations.reorder(
        orderedIds,
        user?.role === 'super_admin' ? companyId ?? undefined : undefined,
      )
      const fresh = await Locations.list(
        user?.role === 'super_admin' ? companyId ?? undefined : undefined,
      )
      setRows(fresh)
    } finally {
      setMoving(false)
    }
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לנהל מיקומים</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            מיקומים בתוך הממכר
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            תת-ישויות כמו סלון, מטבח, לובי קומתי וכו'. ניתן לסמן מיקומים שזמינים רק לשטח ציבורי.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={importFromSystem}
            className="tact-btn tact-btn-ghost"
            disabled={importing || needsCompany}
            title="הוסף לקטלוג את כל המיקומים הפעילים מרשימת מיקומי המערכת"
          >
            {importing ? 'מייבא…' : '⤓ יבא ממיקומי מערכת'}
          </button>
          <button onClick={openCreate} className="tact-btn tact-btn-primary">
            + מיקום חדש
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
            {
              header: 'מזהה',
              key: 'id',
              width: 90,
              render: (r) => (
                <span
                  style={{
                    fontFamily: 'var(--font-family-en)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--color-text-light)',
                    background: 'var(--color-bg)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  M{String(r.id).padStart(3, '0')}
                </span>
              ),
            },
            {
              header: 'מיקום',
              key: 'sort_order',
              width: 100,
              render: (r) => {
                const idx = rows.findIndex((x) => x.id === r.id)
                const canUp = idx > 0
                const canDown = idx < rows.length - 1
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      style={{
                        minWidth: 22,
                        textAlign: 'center',
                        fontFamily: 'var(--font-family-en)',
                        fontWeight: 600,
                        color: 'var(--color-primary)',
                      }}
                    >
                      {idx + 1}
                    </span>
                    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                      <button
                        onClick={() => move(r, 'up')}
                        disabled={!canUp || moving}
                        title="העלה"
                        style={arrowBtnStyle(canUp && !moving)}
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => move(r, 'down')}
                        disabled={!canDown || moving}
                        title="הורד"
                        style={arrowBtnStyle(canDown && !moving)}
                      >
                        ▼
                      </button>
                    </div>
                  </div>
                )
              },
            },
            { header: 'שם', key: 'name' },
            {
              header: 'תחולה',
              key: 'applies_to_public_only',
              render: (r) =>
                r.applies_to_public_only ? (
                  <span className="tact-badge tact-badge-new">שטחים ציבוריים בלבד</span>
                ) : (
                  <span className="tact-badge tact-badge-on">כל היחידות</span>
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
          empty="אין עדיין מיקומים. הוסף סלון, מטבח וכו'."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת מיקום' : 'מיקום חדש'}
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
        <Field
          label="שם המיקום"
          hint={editing ? undefined : 'יתווסף בסוף הרשימה. ניתן להזיז עם החצים בטבלה.'}
        >
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="תחולה">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.applies_to_public_only}
              onChange={(e) =>
                setForm({ ...form, applies_to_public_only: e.target.checked })
              }
            />
            <span style={{ fontSize: '0.9rem' }}>זמין רק ביחידות מסוג "שטח ציבורי"</span>
          </label>
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

import { useEffect, useRef, useState } from 'react'
import {
  SystemLocations,
  type SystemLocationRow,
  type SystemLocationImportSummary,
} from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAlert, useConfirm } from '../components/Dialog'
import TactIcon from '../components/TactIcon'
import type { NavKey } from '../components/AppShell'

type Props = { onNavigate: (k: NavKey) => void }

type FormState = {
  name: string
  code: string
  is_active: boolean
}

const EMPTY_FORM: FormState = { name: '', code: '', is_active: true }

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

export default function SystemLocationsPage({ onNavigate }: Props) {
  const alert = useAlert()
  const confirm = useConfirm()
  const [rows, setRows] = useState<SystemLocationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<SystemLocationRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [busy, setBusy] = useState<'download' | 'upload' | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  function load() {
    setLoading(true)
    SystemLocations.detail()
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
  function openEdit(l: SystemLocationRow) {
    setEditing(l)
    setForm({ name: l.name, code: l.code || '', is_active: l.is_active })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    const body = {
      name: form.name.trim(),
      code: form.code.trim() || null,
      is_active: form.is_active,
    }
    try {
      if (editing) await SystemLocations.update(editing.id, body)
      else await SystemLocations.create(body)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(l: SystemLocationRow) {
    const ok = await confirm({
      title: 'מחיקת מיקום',
      message: `למחוק את "${l.name}" מרשימת מיקומי המערכת? התבניות הקיימות שמשתמשות בשם הזה לא יושפעו.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    await SystemLocations.remove(l.id)
    load()
  }

  async function move(loc: SystemLocationRow, dir: 'up' | 'down') {
    if (moving) return
    const idx = rows.findIndex((r) => r.id === loc.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return
    const newOrder = [...rows]
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    setMoving(true)
    try {
      await SystemLocations.reorder(newOrder.map((r) => r.id))
      setRows(await SystemLocations.detail())
    } finally {
      setMoving(false)
    }
  }

  async function handleDownload() {
    setBusy('download')
    try {
      await SystemLocations.downloadXlsx()
    } catch (e) {
      alert({ title: 'שגיאת ייצוא', message: String(e), variant: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  async function handleFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''  // allow re-selecting the same file
    if (!f) return
    const ok = await confirm({
      title: 'יבוא מ-Excel',
      message:
        `הרשימה הקיימת תימחק לחלוטין ותוחלף בתוכן של "${f.name}". ` +
        'המזהים בקובץ אינם משפיעים — סדר השורות בקובץ הוא הסדר החדש. להמשיך?',
      variant: 'danger',
      confirmLabel: 'יבא והחלף',
    })
    if (!ok) return
    setBusy('upload')
    try {
      const summary: SystemLocationImportSummary = await SystemLocations.importXlsx(f)
      const lines = [
        `נטענו מהקובץ: ${summary.created}`,
        `נמחקו (רשימה קודמת): ${summary.deleted}`,
      ]
      if (summary.errors.length) {
        lines.push('')
        lines.push('אזהרות:')
        for (const err of summary.errors) lines.push('• ' + err)
      }
      await alert({
        title: 'היבוא הסתיים',
        message: lines.join('\n'),
        variant: summary.errors.length ? 'default' : 'success',
      })
      load()
    } catch (e) {
      alert({ title: 'שגיאת יבוא', message: String(e), variant: 'danger' })
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16, gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
            <button
              onClick={() => onNavigate('system_admin')}
              className="tact-btn tact-btn-ghost"
              style={{ padding: '4px 10px', fontSize: '0.75rem' }}
              title="חזרה לניהול מערכת"
            >
              ← חזרה
            </button>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
              מיקומי מערכת
            </h2>
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            רשימה ראשית של מיקומים (סלון, מטבח, לובי וכו'). משמשת את עורך התבניות בכל הפרויקטים.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={handleDownload}
            className="tact-btn tact-btn-ghost"
            disabled={busy !== null}
            title="הורד את כל הרשימה כקובץ Excel"
          >
            <TactIcon name="document" size={14} /> &nbsp;{busy === 'download' ? 'מוריד…' : 'יצוא ל-Excel'}
          </button>
          <button
            onClick={() => fileInputRef.current?.click()}
            className="tact-btn tact-btn-ghost"
            disabled={busy !== null}
            title="טען רשימה מקובץ Excel (סנכרון מלא)"
          >
            <TactIcon name="copy" size={14} /> &nbsp;{busy === 'upload' ? 'מייבא…' : 'יבוא מ-Excel'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx"
            onChange={handleFileChosen}
            style={{ display: 'none' }}
          />
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
                  L{String(r.id).padStart(3, '0')}
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
              header: 'קוד',
              key: 'code',
              width: 130,
              render: (r) =>
                r.code ? (
                  <span style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.85rem' }}>{r.code}</span>
                ) : (
                  <span style={{ color: 'var(--color-text-light)' }}>—</span>
                ),
            },
            {
              header: 'סטטוס',
              key: 'is_active',
              width: 100,
              render: (r) =>
                r.is_active ? (
                  <span className="tact-badge tact-badge-on">פעיל</span>
                ) : (
                  <span className="tact-badge tact-badge-soon">מושבת</span>
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
          empty="אין עדיין מיקומים. הוסף סלון, מטבח וכו' או יבא מ-Excel."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת מיקום מערכת' : 'מיקום מערכת חדש'}
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
          <input
            style={inputStyle}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            autoFocus
          />
        </Field>
        <Field label="קוד (אופציונלי)" hint="קוד טכני קצר, לשימוש פנימי. נדרש שיהיה ייחודי אם מולא.">
          <input
            style={{ ...inputStyle, fontFamily: 'var(--font-family-en)' }}
            value={form.code}
            onChange={(e) => setForm({ ...form, code: e.target.value })}
          />
        </Field>
        <Field label="סטטוס">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>פעיל (יופיע ב-picker של עורך התבניות)</span>
          </label>
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

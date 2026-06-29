import { useEffect, useState } from 'react'
import { CompanyProfessionals, type CompanyProfessionalRow } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useAlert, useConfirm } from '../components/Dialog'
import type { NavKey } from '../components/AppShell'

type Props = { onNavigate: (k: NavKey) => void }

type FormState = { name: string; is_active: boolean }

const EMPTY_FORM: FormState = { name: '', is_active: true }

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

export default function CompanyProfessionalsPage({ onNavigate }: Props) {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const confirm = useConfirm()
  const alert = useAlert()
  const canWrite = user?.role === 'super_admin' || user?.role === 'company_admin'
  const needsCompany = user?.role === 'super_admin' && !companyId
  // company_id is only sent when a super_admin is acting on a specific company.
  const cidParam = user?.role === 'super_admin' ? companyId ?? undefined : undefined

  const [rows, setRows] = useState<CompanyProfessionalRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<CompanyProfessionalRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  const [importing, setImporting] = useState(false)

  function load() {
    if (needsCompany) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    CompanyProfessionals.list(cidParam)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [companyId])

  function openCreate() {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(r: CompanyProfessionalRow) {
    setEditing(r)
    setForm({ name: r.name, is_active: r.is_active })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    if (!form.name.trim()) {
      setSaveErr('יש להזין שם סיווג')
      return
    }
    const payload = {
      name: form.name.trim(),
      is_active: form.is_active,
      sort_order: editing?.sort_order ?? rows.length,
    }
    try {
      if (editing) await CompanyProfessionals.update(editing.id, payload as any)
      else await CompanyProfessionals.create(payload as any, cidParam)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(r: CompanyProfessionalRow) {
    const ok = await confirm({
      title: 'מחיקת סיווג',
      message: `למחוק את הסיווג "${r.name}"? פעולה זו לא ניתנת לביטול.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    try {
      await CompanyProfessionals.remove(r.id)
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function move(r: CompanyProfessionalRow, dir: 'up' | 'down') {
    if (moving) return
    const idx = rows.findIndex((x) => x.id === r.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return
    const newOrder = [...rows]
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    setMoving(true)
    try {
      await CompanyProfessionals.reorder(newOrder.map((x) => x.id), cidParam)
      const fresh = await CompanyProfessionals.list(cidParam)
      setRows(fresh)
    } finally {
      setMoving(false)
    }
  }

  async function resetToDefault() {
    const ok = await confirm({
      title: 'שחזור לברירת מחדל',
      message:
        'רשימת הסיווגים הקיימת של החברה תימחק לחלוטין ותוחלף ברשימת הסיווגים ' +
        'של המערכת (חשמל, אינסטלציה, גמרים…). פעולה זו לא ניתנת לביטול. להמשיך?',
      variant: 'danger',
      confirmLabel: 'שחזר והחלף',
    })
    if (!ok) return
    setImporting(true)
    try {
      const summary = await CompanyProfessionals.importFromSystem(cidParam)
      await alert({
        title: 'השחזור הסתיים',
        message: `נטענו מהמערכת: ${summary.added}\nנמחקו (רשימה קודמת): ${summary.deleted}`,
        variant: 'success',
      })
      load()
    } catch (e) {
      setError(String(e))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            סיווגי בעלי מקצוע
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            רשימת הסיווגים של החברה (אלומיניום, אינסטלציה, חשמל, גמרים…)
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="tact-btn tact-btn-ghost"
            onClick={() => onNavigate('admin')}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            ← חזרה לניהול חברה
          </button>
          {canWrite && !needsCompany && (
            <button
              onClick={resetToDefault}
              className="tact-btn tact-btn-ghost"
              disabled={importing}
              title="מחק את הרשימה הקיימת והחלף אותה ברשימת הסיווגים של המערכת"
            >
              {importing ? 'משחזר…' : '⤓ שחזר לברירת מחדל'}
            </button>
          )}
          {canWrite && !needsCompany && (
            <button onClick={openCreate} className="tact-btn tact-btn-primary">
              + סיווג חדש
            </button>
          )}
        </div>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      {needsCompany ? (
        <div className="tact-kpi" style={{ textAlign: 'center' }}>
          <div className="tact-kpi-label">בחר חברה כדי לנהל את הסיווגים שלה</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
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
                    <span style={{ minWidth: 22, textAlign: 'center', fontFamily: 'var(--font-family-en)', fontWeight: 600, color: 'var(--color-primary)' }}>
                      {idx + 1}
                    </span>
                    {canWrite && (
                      <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 1 }}>
                        <button onClick={() => move(r, 'up')} disabled={!canUp || moving} title="העלה" style={arrowBtnStyle(canUp && !moving)}>▲</button>
                        <button onClick={() => move(r, 'down')} disabled={!canDown || moving} title="הורד" style={arrowBtnStyle(canDown && !moving)}>▼</button>
                      </div>
                    )}
                  </div>
                )
              },
            },
            { header: 'סיווג', key: 'name' },
            {
              header: 'סטטוס',
              key: 'is_active',
              width: 90,
              render: (r) => (
                <span className={`tact-badge ${r.is_active ? 'tact-badge-pos' : 'tact-badge-soon'}`}>
                  {r.is_active ? 'פעיל' : 'לא פעיל'}
                </span>
              ),
            },
          ]}
          actions={
            canWrite
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
          empty="עדיין אין סיווגים. לחץ '+ סיווג חדש' להתחיל."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת סיווג' : 'סיווג חדש'}
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
        <Field label="שם הסיווג" hint="לדוגמה: אלומיניום, אינסטלציה, חשמל, גמרים">
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
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

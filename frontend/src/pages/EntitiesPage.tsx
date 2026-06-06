import { useEffect, useState } from 'react'
import { EntityTypes, type EntityKind, type EntityTypeRow } from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth } from '../lib/AuthContext'
import { useConfirm } from '../components/Dialog'
import type { NavKey } from '../components/AppShell'

type Props = { onNavigate: (k: NavKey) => void }

type FormState = {
  name: string
  code: string
  kind: EntityKind
  is_active: boolean
}

const EMPTY_FORM: FormState = { name: '', code: '', kind: 'unit', is_active: true }

export const KIND_LABEL: Record<EntityKind, string> = {
  building: 'בניין',
  floor: 'קומה',
  unit: 'יחידה',
  location: 'מיקום',
}

const KIND_HINT: Record<EntityKind, string> = {
  building: 'ישות-על: מבנה שלם. תחתיו קומות',
  floor: 'קומה בתוך מבנה. תחתיה דירות ומיקומים ציבוריים',
  unit: 'יחידה כמו דירה / חניון / שטחי ציבור — תחתיה מיקומים',
  location: 'מיקום סופי (חדר, פינה) — אין מתחתיו כלום',
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

export default function EntitiesPage({ onNavigate }: Props) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const canWrite = user?.role === 'super_admin'
  const [rows, setRows] = useState<EntityTypeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<EntityTypeRow | null>(null)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [saveErr, setSaveErr] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)

  function load() {
    setLoading(true)
    EntityTypes.list()
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
  function openEdit(r: EntityTypeRow) {
    setEditing(r)
    setForm({
      name: r.name,
      code: r.code || '',
      kind: r.kind,
      is_active: r.is_active,
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    const payload = {
      name: form.name,
      code: form.code || null,
      kind: form.kind,
      is_active: form.is_active,
      sort_order: editing?.sort_order ?? rows.length,
    }
    try {
      if (editing) await EntityTypes.update(editing.id, payload as any)
      else await EntityTypes.create(payload as any)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(r: EntityTypeRow) {
    const ok = await confirm({
      title: 'מחיקת ישות מורכבת',
      message: `למחוק את הישות המורכבת "${r.name}"? פעולה זו לא ניתנת לביטול.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    try {
      await EntityTypes.remove(r.id)
      load()
    } catch (e) {
      setError(String(e))
    }
  }

  async function move(r: EntityTypeRow, dir: 'up' | 'down') {
    if (moving) return
    const idx = rows.findIndex((x) => x.id === r.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return
    const newOrder = [...rows]
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    setMoving(true)
    try {
      await EntityTypes.reorder(newOrder.map((x) => x.id))
      const fresh = await EntityTypes.list()
      setRows(fresh)
    } finally {
      setMoving(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            ישויות מורכבות
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            רשימת הישויות שתחתן אפשר לתלות מיקומים (מבנה מגורים, דירה, חניון וכו'). משותף לכל החברות במערכת.
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="tact-btn tact-btn-ghost"
            onClick={() => onNavigate('system_admin')}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            ← חזרה לניהול מערכת
          </button>
          {canWrite && (
            <button onClick={openCreate} className="tact-btn tact-btn-primary">
              + ישות מורכבת חדשה
            </button>
          )}
        </div>
      </div>

      {!canWrite && (
        <div className="tact-badge tact-badge-soon" style={{ marginBottom: 12 }}>
          תצוגה בלבד — רק מנהל-על יכול לערוך
        </div>
      )}
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
                  E{String(r.id).padStart(3, '0')}
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
            { header: 'שם', key: 'name' },
            {
              header: 'סוג בעץ',
              key: 'kind',
              width: 110,
              render: (r) => (
                <span className="tact-badge tact-badge-on">{KIND_LABEL[r.kind] || r.kind}</span>
              ),
            },
            {
              header: 'קוד',
              key: 'code',
              render: (r) => (
                <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                  {r.code || '—'}
                </code>
              ),
            },
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
          empty="עדיין אין ישויות מורכבות. לחץ '+ ישות מורכבת חדשה' להתחיל."
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת ישות מורכבת' : 'ישות מורכבת חדשה'}
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
        <Field label="שם הישות המורכבת" hint="לדוגמה: מבנה מגורים, דירה, חניון, גינה ציבורית">
          <input style={inputStyle} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </Field>
        <Field label="סוג בעץ הפרויקט" hint={KIND_HINT[form.kind]}>
          <select
            style={inputStyle}
            value={form.kind}
            onChange={(e) => setForm({ ...form, kind: e.target.value as EntityKind })}
          >
            <option value="building">בניין</option>
            <option value="floor">קומה</option>
            <option value="unit">יחידה</option>
            <option value="location">מיקום</option>
          </select>
        </Field>
        <Field label="קוד (אנגלית)" hint="אופציונלי — למיפוי פנימי. לדוגמה: apartment, garden">
          <input style={inputStyle} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
        </Field>
        <Field label="סטטוס">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>פעיל (יוצג בדרופדאון של יחידות ממכר)</span>
          </label>
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

import { useState } from 'react'
import Modal, { Field, inputStyle } from '../Modal'
import type { BulkAddUnitsPayload } from '../../lib/api'
import { UNIT_TYPE_OPTIONS } from './shared'

type Props = {
  open: boolean
  floorName: string
  onClose: () => void
  onAdd: (body: BulkAddUnitsPayload) => Promise<void>
}

export default function AddUnitsModal({ open, floorName, onClose, onAdd }: Props) {
  const [unitType, setUnitType] = useState('apartment')
  const [count, setCount] = useState(1)
  const [startNumber, setStartNumber] = useState('')
  const [number, setNumber] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const isApartment = unitType === 'apartment'

  function reset() {
    setUnitType('apartment')
    setCount(1)
    setStartNumber('')
    setNumber('')
    setErr(null)
  }

  async function submit() {
    setErr(null)
    setBusy(true)
    try {
      const body: BulkAddUnitsPayload = isApartment
        ? {
            unit_type: 'apartment',
            count: Math.max(1, count),
            start_number: startNumber.trim() ? Number(startNumber) : null,
          }
        : { unit_type: unitType, count: 1, number: number.trim() || null }
      await onAdd(body)
      reset()
      onClose()
    } catch (e) {
      setErr(String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      title={`הוספת יחידות — ${floorName}`}
      onClose={onClose}
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose} disabled={busy}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={submit} disabled={busy}>
            {busy ? 'מוסיף…' : 'הוסף'}
          </button>
        </>
      }
    >
      <Field label="סוג יחידה">
        <select style={inputStyle} value={unitType} onChange={(e) => setUnitType(e.target.value)}>
          {UNIT_TYPE_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </Field>

      {isApartment ? (
        <>
          <Field label="כמות דירות" hint="הדירות ימוספרו אוטומטית רצוף בתוך הכניסה">
            <input
              type="number"
              min={1}
              style={inputStyle}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
          <Field
            label="מספר התחלתי (אופציונלי)"
            hint="ריק = המשך מהמספר הפנוי הבא בכניסה"
          >
            <input
              type="number"
              min={1}
              style={inputStyle}
              value={startNumber}
              onChange={(e) => setStartNumber(e.target.value)}
              placeholder="אוטומטי"
            />
          </Field>
        </>
      ) : (
        <Field label="מספר היחידה">
          <input
            style={inputStyle}
            value={number}
            onChange={(e) => setNumber(e.target.value)}
            placeholder="למשל: 12 / A3"
          />
        </Field>
      )}

      {err && <div style={{ color: 'var(--color-accent)' }}>{err}</div>}
    </Modal>
  )
}

import { useEffect, useState } from 'react'
import Modal, { Field, inputStyle } from './Modal'
import ProfessionalPicker from './ProfessionalPicker'
import AttachmentsPanel from './AttachmentsPanel'
import { Malfunctions } from '../lib/api'

/** Emphasized input: white background + steel-blue outline, so form fields
 *  stand out clearly against the dialog. */
const emphInput: React.CSSProperties = {
  ...inputStyle,
  background: 'var(--color-bg-white)',
  border: '1.5px solid var(--color-primary-light)',
}

type Props = {
  open: boolean
  defectId: number | null
  /** Suggested professional name from the defect — pre-fills the "performed_by" field. */
  defaultPerformedBy?: string | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
}

export default function ActivityFormDialog({
  open,
  defectId,
  defaultPerformedBy,
  onClose,
  onSaved,
  onError,
}: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const [occurredOn, setOccurredOn] = useState(today)
  const [action, setAction] = useState('')
  const [performedBy, setPerformedBy] = useState('')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open) return
    setOccurredOn(today)
    setAction('')
    setPerformedBy(defaultPerformedBy || '')
    setNotes('')
  }, [open, defectId])

  async function save() {
    if (!defectId) return
    if (!action.trim()) {
      onError('יש לתאר את הפעילות')
      return
    }
    setSaving(true)
    try {
      await Malfunctions.addActivity(defectId, {
        occurred_on: occurredOn || null,
        action: action.trim(),
        performed_by: performedBy.trim() || null,
        notes: notes.trim() || null,
      })
      onSaved()
    } catch (e) {
      onError(String(e))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal
      open={open}
      title="הוספת פעילות ליומן"
      onClose={onClose}
      width={520}
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'שומר…' : 'הוסף'}
          </button>
        </>
      }
    >
      <Field label="תאריך הפעילות">
        <input
          type="date"
          style={emphInput}
          value={occurredOn}
          onChange={(e) => setOccurredOn(e.target.value)}
        />
      </Field>
      <Field label="פעילות" hint='למשל "ביקור אבחון", "צבע יד שנייה", "בדיקה סופית". ניתן לכתוב בכמה שורות.'>
        <textarea
          style={{ ...emphInput, minHeight: 80, resize: 'vertical' }}
          value={action}
          onChange={(e) => setAction(e.target.value)}
        />
      </Field>
      <Field label="בעל מקצוע">
        <ProfessionalPicker value={performedBy} onChange={setPerformedBy} style={emphInput} />
      </Field>
      <Field label="הערות">
        <textarea
          style={{ ...emphInput, minHeight: 60, resize: 'vertical' }}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
        />
      </Field>

      {defectId !== null && (
        <div style={{ marginTop: 4, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <AttachmentsPanel target={{ malfunctionId: defectId }} title="קבצים מצורפים" />
        </div>
      )}
    </Modal>
  )
}

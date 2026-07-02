import { useEffect, useState } from 'react'
import Modal, { Field, inputStyle } from './Modal'
import ProfessionalPicker from './ProfessionalPicker'
import SignaturePad from './SignaturePad'
import { ActivityTimeline, URGENCY_OPTIONS } from './DefectDetail'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import {
  Malfunctions,
  Locations,
  type LocationRow,
  type MalfunctionDetail,
  type ProjectItemNode,
} from '../lib/api'

type Mode = { kind: 'create'; projectId: number; unitId: number } | { kind: 'edit'; defect: MalfunctionDetail }

type Props = {
  open: boolean
  mode: Mode | null
  /** Pre-loaded subtree of the unit (the unit itself + its locations) so the user
   *  can pick which specific location the defect is on. */
  unitSubtree: ProjectItemNode | null
  onClose: () => void
  onSaved: () => void
  onError: (msg: string) => void
  /** Open the "add activity" dialog for the defect being edited (edit mode only). */
  onAddActivity?: () => void
}

const STATUS_OPTIONS = [
  { value: 'pending_manager', label: 'ממתין לאישור' },
  { value: 'todo', label: 'לביצוע' },
  { value: 'negotiation', label: 'מו"מ' },
  { value: 'frozen', label: 'מוקפא' },
  { value: 'done', label: 'הסתיים' },
  { value: 'cancelled', label: 'בוטל' },
]

const SOURCE_OPTIONS = [
  { value: 'manual', label: 'ידני' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'bedek_report', label: 'דוח בדק' },
  { value: 'inspector_tour', label: 'סיור מפקח' },
  { value: 'delivery_protocol', label: 'פרוטוקול מסירה' },
  { value: 'email', label: 'מייל' },
]

function flattenDescendants(root: ProjectItemNode): ProjectItemNode[] {
  const out: ProjectItemNode[] = []
  function walk(n: ProjectItemNode) {
    out.push(n)
    n.children.forEach(walk)
  }
  walk(root)
  return out
}

export default function DefectFormDialog({ open, mode, unitSubtree, onClose, onSaved, onError, onAddActivity }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const isEdit = mode?.kind === 'edit'
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()

  const [projectItemId, setProjectItemId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('pending_manager')
  const [source, setSource] = useState('manual')
  const [group, setGroup] = useState('unassigned')
  const [urgency, setUrgency] = useState('regular')
  const [professional, setProfessional] = useState('')
  const [locationId, setLocationId] = useState<number | null>(null)
  const [locations, setLocations] = useState<LocationRow[]>([])
  const [openedAt, setOpenedAt] = useState(today)
  const [closedAt, setClosedAt] = useState('')
  const [customerSigned, setCustomerSigned] = useState(false)
  const [signature, setSignature] = useState<string | null>(null)
  const [signedAt, setSignedAt] = useState('')
  const [saving, setSaving] = useState(false)

  // Load the company's room/location catalog for the location picker.
  useEffect(() => {
    if (!open) return
    const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined
    Locations.list(cid)
      .then(setLocations)
      .catch(() => setLocations([]))
  }, [open, user?.role, companyId])

  useEffect(() => {
    if (!open || !mode) return
    if (mode.kind === 'edit') {
      const d = mode.defect
      setProjectItemId(d.project_item_id)
      setDescription(d.description)
      setStatus(d.status)
      setSource(d.source)
      setGroup(d.group)
      setUrgency(d.urgency || 'regular')
      setProfessional(d.professional || '')
      setLocationId(d.location_id)
      setOpenedAt(d.opened_at)
      setClosedAt(d.closed_at || '')
      setCustomerSigned(d.customer_signed)
      setSignature(d.customer_signature)
      setSignedAt(d.customer_signed_at || '')
    } else {
      setProjectItemId(mode.unitId)  // default to the unit itself
      setDescription('')
      setStatus('pending_manager')
      setSource('manual')
      setGroup('unassigned')
      setUrgency('regular')
      setProfessional('')
      setLocationId(null)
      setOpenedAt(today)
      setClosedAt('')
      setCustomerSigned(false)
      setSignature(null)
      setSignedAt('')
    }
  }, [open, mode])

  const candidateItems = unitSubtree ? flattenDescendants(unitSubtree) : []

  async function save() {
    if (!mode) return
    if (!description.trim()) {
      onError('יש להזין תיאור תקלה')
      return
    }
    // Signature fields: only meaningful when the customer signed.
    const sigFields = {
      customer_signed: customerSigned,
      customer_signature: customerSigned ? signature : null,
      customer_signed_at: customerSigned ? signedAt || today : null,
    }
    setSaving(true)
    try {
      if (mode.kind === 'create') {
        await Malfunctions.create({
          project_id: mode.projectId,
          project_item_id: projectItemId,
          location_id: locationId,
          description: description.trim(),
          status,
          source,
          group,
          urgency,
          professional: professional.trim() || null,
          opened_at: openedAt || null,
          ...sigFields,
        })
      } else {
        await Malfunctions.update(mode.defect.id, {
          description: description.trim(),
          status,
          group,
          urgency,
          professional: professional.trim() || null,
          location_id: locationId,
          closed_at: closedAt || null,
          ...sigFields,
        })
      }
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
      title={isEdit ? 'עריכת תקלה' : 'תקלה חדשה'}
      onClose={onClose}
      width={600}
      dense
      footer={
        <>
          <button className="tact-btn tact-btn-ghost" onClick={onClose}>
            ביטול
          </button>
          <button className="tact-btn tact-btn-primary" onClick={save} disabled={saving}>
            {saving ? 'שומר…' : isEdit ? 'שמור' : 'צור תקלה'}
          </button>
        </>
      }
    >
      {!isEdit && (
        <Field label="מיקום ספציפי" hint="לאיזה רכיב התקלה משויכת (יחידה או מיקום בתוכה)">
          <select
            style={inputStyle}
            value={projectItemId ?? ''}
            onChange={(e) => setProjectItemId(e.target.value ? Number(e.target.value) : null)}
          >
            {candidateItems.map((n) => (
              <option key={n.id} value={n.id}>
                {n.kind === 'unit' ? '🏠' : '📍'} {n.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <div style={{ marginBottom: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 6 }}>
          <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-light)' }}>
            תיאור התקלה
          </label>
          {isEdit && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <label style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--color-text-light)', whiteSpace: 'nowrap' }}>
                תאריך סגירה
              </label>
              <input
                type="date"
                title="ריק = פתוחה"
                style={{ ...inputStyle, width: 'auto' }}
                value={closedAt}
                onChange={(e) => setClosedAt(e.target.value)}
              />
            </div>
          )}
        </div>
        <textarea
          style={{ ...inputStyle, minHeight: 52, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='למשל: "סדק בקיר הסלון", "ברז דולף במטבח"'
        />
      </div>

      <Field label="מיקום (חדר)" inline hint="קובע לאיזה חדר התקלה משויכת — לפי סיווג זה מקובצת התצוגה">
        <select
          style={inputStyle}
          value={locationId ?? ''}
          onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : null)}
        >
          <option value="">— ללא מיקום —</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <Field label="בעל מקצוע" inline>
          <ProfessionalPicker value={professional} onChange={setProfessional} style={inputStyle} />
        </Field>
        <Field label="סטטוס" inline>
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="דחיפות" inline>
          <select style={inputStyle} value={urgency} onChange={(e) => setUrgency(e.target.value)}>
            {URGENCY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      {!isEdit && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="מקור" inline>
            <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
          <Field label="תאריך פתיחה" inline>
            <input
              type="date"
              style={inputStyle}
              value={openedAt}
              onChange={(e) => setOpenedAt(e.target.value)}
            />
          </Field>
        </div>
      )}

      {isEdit && mode?.kind === 'edit' && (
        <div style={{ marginTop: 4, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
          <ActivityTimeline activities={mode.defect.activities} onAddActivity={onAddActivity} />
        </div>
      )}

      <div style={{ marginTop: 4, borderTop: '1px solid var(--color-border)', paddingTop: 12 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.9rem', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={customerSigned}
            onChange={(e) => setCustomerSigned(e.target.checked)}
          />
          האם נחתם לקוח
        </label>

        {customerSigned && (
          <div style={{ marginTop: 12 }}>
            <Field label="תאריך חתימה">
              <input
                type="date"
                style={inputStyle}
                value={signedAt || today}
                onChange={(e) => setSignedAt(e.target.value)}
              />
            </Field>
            <Field label="חתימת לקוח">
              <SignaturePad value={signature} onChange={setSignature} />
            </Field>
          </div>
        )}
      </div>
    </Modal>
  )
}

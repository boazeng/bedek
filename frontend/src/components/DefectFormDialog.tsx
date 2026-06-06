import { useEffect, useState } from 'react'
import Modal, { Field, inputStyle } from './Modal'
import {
  Malfunctions,
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

const GROUP_OPTIONS = [
  { value: 'unassigned', label: 'טרם נבחר' },
  { value: 'electricity', label: 'חשמל' },
  { value: 'plumbing', label: 'אינסטלציה' },
  { value: 'finishes', label: 'גמרים' },
  { value: 'structure', label: 'שלד' },
  { value: 'protection', label: 'מיגון' },
  { value: 'sealing', label: 'איטום' },
  { value: 'aluminum', label: 'אלומיניום' },
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

export default function DefectFormDialog({ open, mode, unitSubtree, onClose, onSaved, onError }: Props) {
  const today = new Date().toISOString().slice(0, 10)
  const isEdit = mode?.kind === 'edit'

  const [projectItemId, setProjectItemId] = useState<number | null>(null)
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState('pending_manager')
  const [source, setSource] = useState('manual')
  const [group, setGroup] = useState('unassigned')
  const [professional, setProfessional] = useState('')
  const [openedAt, setOpenedAt] = useState(today)
  const [closedAt, setClosedAt] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !mode) return
    if (mode.kind === 'edit') {
      const d = mode.defect
      setProjectItemId(d.project_item_id)
      setDescription(d.description)
      setStatus(d.status)
      setSource(d.source)
      setGroup(d.group)
      setProfessional(d.professional || '')
      setOpenedAt(d.opened_at)
      setClosedAt(d.closed_at || '')
    } else {
      setProjectItemId(mode.unitId)  // default to the unit itself
      setDescription('')
      setStatus('pending_manager')
      setSource('manual')
      setGroup('unassigned')
      setProfessional('')
      setOpenedAt(today)
      setClosedAt('')
    }
  }, [open, mode])

  const candidateItems = unitSubtree ? flattenDescendants(unitSubtree) : []

  async function save() {
    if (!mode) return
    if (!description.trim()) {
      onError('יש להזין תיאור תקלה')
      return
    }
    setSaving(true)
    try {
      if (mode.kind === 'create') {
        await Malfunctions.create({
          project_id: mode.projectId,
          project_item_id: projectItemId,
          description: description.trim(),
          status,
          source,
          group,
          professional: professional.trim() || null,
          opened_at: openedAt || null,
        })
      } else {
        await Malfunctions.update(mode.defect.id, {
          description: description.trim(),
          status,
          group,
          professional: professional.trim() || null,
          closed_at: closedAt || null,
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

      <Field label="תיאור התקלה">
        <textarea
          style={{ ...inputStyle, minHeight: 70, resize: 'vertical' }}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder='למשל: "סדק בקיר הסלון", "ברז דולף במטבח"'
        />
      </Field>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="קבוצה">
          <select style={inputStyle} value={group} onChange={(e) => setGroup(e.target.value)}>
            {GROUP_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
        <Field label="סטטוס">
          <select style={inputStyle} value={status} onChange={(e) => setStatus(e.target.value)}>
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </Field>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
        <Field label="בעל מקצוע">
          <input
            style={inputStyle}
            value={professional}
            onChange={(e) => setProfessional(e.target.value)}
            placeholder="חשמלאי / אינסטלטור / ..."
          />
        </Field>
        {!isEdit ? (
          <Field label="מקור">
            <select style={inputStyle} value={source} onChange={(e) => setSource(e.target.value)}>
              {SOURCE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="תאריך סגירה" hint="ריק = פתוחה">
            <input
              type="date"
              style={inputStyle}
              value={closedAt}
              onChange={(e) => setClosedAt(e.target.value)}
            />
          </Field>
        )}
      </div>

      {!isEdit && (
        <Field label="תאריך פתיחה">
          <input
            type="date"
            style={inputStyle}
            value={openedAt}
            onChange={(e) => setOpenedAt(e.target.value)}
          />
        </Field>
      )}
    </Modal>
  )
}

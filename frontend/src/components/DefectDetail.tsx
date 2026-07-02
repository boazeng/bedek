import type { MalfunctionDetail, MalfunctionListRow } from '../lib/api'
import AttachmentsPanel from './AttachmentsPanel'

export const STATUS_LABEL: Record<string, string> = {
  pending_manager: 'ממתין לאישור',
  todo: 'לביצוע',
  negotiation: 'מו"מ',
  frozen: 'מוקפא',
  done: 'הסתיים',
  cancelled: 'בוטל',
}

export const STATUS_CLASS: Record<string, string> = {
  todo: 'tact-badge-on',
  pending_manager: 'tact-badge-new',
  negotiation: 'tact-badge-soon',
  frozen: 'tact-badge-soon',
  done: 'tact-badge-pos',
  cancelled: 'tact-badge-soon',
}

export const GROUP_LABEL: Record<string, string> = {
  electricity: 'חשמל',
  plumbing: 'אינסטלציה',
  finishes: 'גמרים',
  structure: 'שלד',
  protection: 'מיגון',
  sealing: 'איטום',
  aluminum: 'אלומיניום',
  unassigned: 'טרם נבחר',
}

export const SOURCE_LABEL: Record<string, string> = {
  whatsapp: 'WhatsApp',
  manual: 'ידני',
  bedek_report: 'דוח בדק',
  inspector_tour: 'סיור מפקח',
  delivery_protocol: 'פרוטוקול מסירה',
  email: 'מייל',
}

/** Display-only short defect number: strip the project/building/entrance
 *  segments (P#####, B##, E##) → e.g. "P00007-B01-E01-F04-7-1" → "F04-7-1". */
export function shortDefectNumber(full: string | null): string {
  if (!full) return ''
  const parts = full.split('-')
  let i = 0
  while (i < parts.length && /^[PBE]\d+$/i.test(parts[i])) i++
  const rest = parts.slice(i)
  return rest.length ? rest.join('-') : full
}

/** One collapsible defect row + its expanded full-detail view (fields, activity
 *  timeline, attachments). Shared by the unit-defects and update-defects pages.
 *  `compact` renders the update-defects column set: short number · description ·
 *  professional · status · opened-at (no entity/group columns). */
export function DefectRow({
  defect,
  expanded,
  detail,
  canWrite,
  compact = false,
  onToggle,
  onEdit,
  onAddActivity,
}: {
  defect: MalfunctionListRow
  expanded: boolean
  detail: MalfunctionDetail | undefined
  canWrite: boolean
  compact?: boolean
  onToggle: () => void
  onEdit: () => void
  onAddActivity: () => void
}) {
  const shownNumber = compact ? shortDefectNumber(defect.number) : defect.number
  return (
    <div style={{ borderBottom: '1px solid var(--color-border)' }}>
      <button
        onClick={onToggle}
        style={{
          width: '100%',
          background: expanded ? 'var(--color-primary-soft)' : 'transparent',
          border: 'none',
          padding: '12px 16px',
          display: 'grid',
          gridTemplateColumns: compact ? '24px 1fr 140px 110px 110px' : '24px 1fr 110px 100px 100px 110px',
          gap: 10,
          alignItems: 'center',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'start',
        }}
      >
        <span style={{ color: 'var(--color-primary)', fontSize: '0.8rem' }}>
          {expanded ? '▼' : '◀'}
        </span>
        <span style={{ fontWeight: 500, fontSize: '0.95rem', display: 'flex', flexDirection: 'column', gap: 2 }}>
          {shownNumber && (
            <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.72rem', color: 'var(--color-primary)' }}>
              {shownNumber}
            </code>
          )}
          <span>{defect.description}</span>
        </span>
        {compact ? (
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
            {defect.professional || '—'}
          </span>
        ) : (
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
            {defect.project_item_name || '—'}
          </span>
        )}
        <span className={`tact-badge ${STATUS_CLASS[defect.status] || ''}`}>
          {STATUS_LABEL[defect.status] || defect.status}
        </span>
        {!compact && (
          <span style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
            {GROUP_LABEL[defect.group] || defect.group}
          </span>
        )}
        <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
          {new Date(defect.opened_at).toLocaleDateString('he-IL')}
        </span>
      </button>

      {expanded && (
        <div style={{ padding: '14px 22px', background: 'var(--color-bg)', borderTop: '1px solid var(--color-border)' }}>
          {!detail ? (
            <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>טוען פרטים…</div>
          ) : (
            <>
              {canWrite && (
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-start', marginBottom: 12 }}>
                  <button
                    onClick={onEdit}
                    className="tact-btn tact-btn-ghost"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    ערוך תקלה
                  </button>
                  <button
                    onClick={onAddActivity}
                    className="tact-btn tact-btn-ghost"
                    style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                  >
                    + פעילות חדשה
                  </button>
                </div>
              )}
              <DefectDetailView detail={detail} canWrite={canWrite} />
            </>
          )}
        </div>
      )}
    </div>
  )
}

function DefectDetailView({ detail, canWrite }: { detail: MalfunctionDetail; canWrite: boolean }) {
  return (
    <div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(3, 1fr)',
          gap: 12,
          marginBottom: 16,
        }}
      >
        <Field label="מספר תקלה">
          <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.82rem', color: 'var(--color-primary)', fontWeight: 700 }}>
            {detail.number || '—'}
          </code>
        </Field>
        <Field label="ישות ספציפית">
          <div>
            <strong>{detail.project_item_name || '—'}</strong>
            {detail.project_item_number && (
              <div style={{ fontSize: '0.74rem', color: 'var(--color-text-light)', fontFamily: 'var(--font-family-en)', marginTop: 2 }}>
                {detail.project_item_number}
              </div>
            )}
          </div>
        </Field>
        <Field label="בעל מקצוע">
          <span>{detail.professional || <em style={{ color: 'var(--color-text-light)' }}>לא שויך</em>}</span>
        </Field>
        <Field label="קבוצה">
          <span>{GROUP_LABEL[detail.group] || detail.group}</span>
        </Field>
        <Field label="מקור">
          <span>{SOURCE_LABEL[detail.source] || detail.source}</span>
        </Field>
        <Field label="תאריך פתיחה">
          <span>{new Date(detail.opened_at).toLocaleDateString('he-IL')}</span>
        </Field>
        <Field label="תאריך סגירה">
          <span>{detail.closed_at ? new Date(detail.closed_at).toLocaleDateString('he-IL') : <em style={{ color: 'var(--color-text-light)' }}>פתוחה</em>}</span>
        </Field>
      </div>

      <Field label="תיאור התקלה">
        <div style={{ whiteSpace: 'pre-wrap' }}>{detail.description}</div>
      </Field>

      <div style={{ marginTop: 18 }}>
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-primary)', marginBottom: 8 }}>
          יומן פעילויות ({detail.activities.length})
        </div>
        {detail.activities.length === 0 ? (
          <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)' }}>
            עדיין לא תועדו פעילויות
          </div>
        ) : (
          <ol
            style={{
              listStyle: 'none',
              padding: 0,
              margin: 0,
              borderInlineStart: '2px solid var(--color-primary-soft)',
              paddingInlineStart: 14,
            }}
          >
            {detail.activities.map((a) => (
              <li key={a.id} style={{ padding: '8px 0' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'baseline' }}>
                  {a.number && (
                    <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.74rem', color: 'var(--color-primary)', fontWeight: 700 }}>
                      {a.number}
                    </code>
                  )}
                  <span style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.78rem', color: 'var(--color-text-light)', minWidth: 90 }}>
                    {new Date(a.occurred_on).toLocaleDateString('he-IL')}
                  </span>
                  <strong style={{ fontSize: '0.9rem', whiteSpace: 'pre-wrap' }}>{a.action}</strong>
                  {a.performed_by && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>· {a.performed_by}</span>
                  )}
                </div>
                {a.notes && <div style={{ fontSize: '0.82rem', color: 'var(--color-text-light)', marginTop: 2, marginInlineStart: 100 }}>{a.notes}</div>}
              </li>
            ))}
          </ol>
        )}
      </div>

      <div style={{ marginTop: 18 }}>
        <AttachmentsPanel target={{ malfunctionId: detail.id }} canWrite={canWrite} />
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div style={{ fontSize: '0.74rem', fontWeight: 600, color: 'var(--color-text-light)', marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: '0.92rem' }}>{children}</div>
    </div>
  )
}

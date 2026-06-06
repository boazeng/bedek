import type { NavKey } from '../components/AppShell'

type Props = { onNavigate: (k: NavKey) => void }

/** Placeholder: catalog of tradespeople / professionals (electrician, plumber, …). */
export default function ProfessionalsPage({ onNavigate }: Props) {
  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            בעלי מקצוע
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            קטלוג בעלי המקצוע שמטפלים בליקויים (חשמלאי, אינסטלטור, גמרים וכו')
          </div>
        </div>
        <button
          className="tact-btn tact-btn-ghost"
          onClick={() => onNavigate('system_admin')}
          style={{ padding: '8px 16px', fontSize: '0.85rem' }}
        >
          ← חזרה לניהול מערכת
        </button>
      </div>
      <div
        style={{
          background: 'var(--color-bg-white)',
          border: '1px dashed var(--color-border)',
          borderRadius: 14,
          padding: '80px 20px',
          textAlign: 'center',
          color: 'var(--color-text-light)',
        }}
      >
        <div style={{ fontSize: '0.95rem', marginBottom: 6 }}>
          ניהול קטלוג בעלי המקצוע
        </div>
        <div style={{ fontSize: '0.82rem' }}>בקרוב — כרגע ריק.</div>
      </div>
    </div>
  )
}

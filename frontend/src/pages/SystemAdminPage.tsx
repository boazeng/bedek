import { useState } from 'react'
import { Crm } from '../lib/api'
import { useAlert } from '../components/Dialog'
import TactIcon from '../components/TactIcon'
import type { NavKey } from '../components/AppShell'

type Props = {
  /** Navigate to another sidebar item (used by the inline buttons below). */
  onNavigate: (key: NavKey) => void
}

type AdminLink = {
  key: NavKey
  label: string
  icon: string
  description: string
}

const LINKS: AdminLink[] = [
  {
    key: 'companies',
    label: 'חברות',
    icon: 'briefcase',
    description: 'ניהול החברות במערכת — הוספה, עריכה, השבתה',
  },
  {
    key: 'system_users',
    label: 'משתמשי מערכת',
    icon: 'users',
    description: 'מנהלי-על שמנהלים את כל המערכת — לא משויכים לחברה ספציפית',
  },
  {
    key: 'professionals',
    label: 'סיווגי בעלי מקצוע',
    icon: 'tool',
    description: 'רשימת הסיווגים לטיפול בליקויים (אלומיניום, אינסטלציה, חשמל, גמרים…)',
  },
]

export default function SystemAdminPage({ onNavigate }: Props) {
  const alert = useAlert()
  const [syncing, setSyncing] = useState(false)

  async function syncAllProjects() {
    setSyncing(true)
    try {
      const res = await Crm.syncAllProjects()
      await alert({
        title: 'סנכרון פרויקטים מ-CRM',
        message: `סונכרנו ${res.companies} חברות · פרויקטים נוצרו: ${res.projects_created} · עודכנו: ${res.projects_updated}`,
        variant: 'success',
      })
    } catch (e) {
      alert({ title: 'שגיאת סנכרון', message: String(e), variant: 'danger' })
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            ניהול מערכת
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            הגדרות מערכת ותחזוקה — מיועד לבעלים
          </div>
        </div>
        <button
          onClick={syncAllProjects}
          className="tact-btn tact-btn-ghost"
          disabled={syncing}
          title="משוך/עדכן את הפרויקטים של כל החברות המקושרות מ-TACT-CRM"
        >
          {syncing ? 'מסנכרן…' : '⟳ סנכרון פרויקטים מ-CRM'}
        </button>
      </div>

      <div
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
        style={{ maxWidth: 980 }}
      >
        {LINKS.map((link) => (
          <button
            key={link.key}
            onClick={() => onNavigate(link.key)}
            style={{
              textAlign: 'start',
              background: 'var(--color-bg-white)',
              border: '1px solid var(--color-border)',
              borderRadius: 14,
              padding: '18px 20px',
              cursor: 'pointer',
              transition: 'transform .18s, box-shadow .18s, border-color .18s',
              font: 'inherit',
              color: 'var(--color-text)',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
            }}
            onMouseEnter={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.transform = 'translateY(-3px)'
              el.style.boxShadow = '0 12px 30px rgba(28,27,25,0.10)'
              el.style.borderColor = 'var(--color-primary-soft)'
            }}
            onMouseLeave={(e) => {
              const el = e.currentTarget as HTMLButtonElement
              el.style.transform = 'translateY(0)'
              el.style.boxShadow = 'none'
              el.style.borderColor = 'var(--color-border)'
            }}
          >
            <div
              style={{
                width: 42,
                height: 42,
                borderRadius: 12,
                background: 'var(--color-primary-soft)',
                color: 'var(--color-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <TactIcon name={link.icon} size={22} />
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '0.98rem', marginBottom: 2 }}>
                {link.label}
              </div>
              <div style={{ fontSize: '0.78rem', color: 'var(--color-text-light)', lineHeight: 1.4 }}>
                {link.description}
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

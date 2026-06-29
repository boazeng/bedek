import TactIcon from '../components/TactIcon'
import type { NavKey } from '../components/AppShell'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'

type Props = {
  /** Navigate to another sidebar item (used by the inline tiles below). */
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
    key: 'project_structure',
    label: 'מבנה הפרויקטים',
    icon: 'building',
    description: 'בניית מבנה הפרויקט — בניינים, כניסות, קומות ויחידות ממכר (בגרירה)',
  },
  {
    key: 'company_users',
    label: 'משתמשי חברה',
    icon: 'users',
    description: 'ניהול משתמשי החברה — אדמין, מפקחים, דיירים',
  },
  {
    key: 'locations',
    label: 'מיקומים של החברה',
    icon: 'layout',
    description: 'קטלוג מיקומי הליקויים (סלון, מטבח, לובי קומתי…) — נבחר בעת פתיחת תקלה',
  },
  {
    key: 'company_professionals',
    label: 'סיווגי בעלי מקצוע',
    icon: 'tool',
    description: 'רשימת הסיווגים של החברה (אלומיניום, אינסטלציה, חשמל, גמרים…)',
  },
]

export default function AdminPage({ onNavigate }: Props) {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const needsCompany = user?.role === 'super_admin' && !companyId

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          ניהול תשתית — {user?.company_name || ''}
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          ניהול ההגדרות והנתונים השמורים של החברה
        </div>
      </div>

      {needsCompany ? (
        <div className="tact-kpi" style={{ textAlign: 'center' }}>
          <div className="tact-kpi-label">בחר חברה כדי לנהל את התשתית שלה</div>
        </div>
      ) : (
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
      )}
    </div>
  )
}

import { type ReactNode } from 'react'
import { useAuth } from '../lib/AuthContext'
import TactLogo from './TactLogo'
import TactIcon from './TactIcon'
import CompanyPicker from './CompanyPicker'

export type NavKey =
  | 'dashboard'
  | 'open_malfunction'
  | 'companies'          // moved into system_admin
  | 'projects'
  | 'locations'          // moved into admin
  | 'malfunctions'
  | 'unit_defects'       // sub-page of malfunctions (no sidebar entry)
  | 'admin'
  | 'system_admin'
  | 'entities'           // sub-page of system_admin
  | 'professionals'      // sub-page of system_admin
  | 'templates'          // system-scope templates page (under system_admin)
  | 'company_templates'  // company-scope templates page (under admin)
  | 'company_professionals' // company-scope trade classifications (under admin)
  | 'system_locations'   // sub-page of system_admin
  | 'system_users'       // sub-page of system_admin — super_admin users
  | 'company_users'      // sub-page of admin — company-scoped users
  | 'sale_units'         // legacy — no sidebar entry, page still exists

type NavItem = {
  key: NavKey
  label: string
  icon: string
  roles: ('super_admin' | 'company_admin' | 'company_user' | 'end_customer')[]
}

const MAIN_NAV: NavItem[] = [
  { key: 'dashboard',  label: 'דף הבית',     icon: 'dashboard',  roles: ['super_admin', 'company_admin', 'company_user', 'end_customer'] },
  { key: 'open_malfunction', label: 'פתיחת תקלה', icon: 'tool', roles: ['super_admin', 'company_admin', 'company_user'] },
  { key: 'malfunctions', label: 'תקלות',      icon: 'alert',      roles: ['super_admin', 'company_admin', 'company_user'] },
  { key: 'projects',   label: 'פרויקטים',      icon: 'document',   roles: ['super_admin', 'company_admin', 'company_user'] },
  { key: 'admin',      label: 'ניהול חברה',    icon: 'server',     roles: ['super_admin', 'company_admin'] },
]

// Items rendered in the sidebar footer, just above the logout button.
// TODO(boaz): tighten roles to ['super_admin'] once the owners-only restriction is decided.
const BOTTOM_NAV: NavItem[] = [
  { key: 'system_admin', label: 'ניהול מערכת', icon: 'spark', roles: ['super_admin', 'company_admin'] },
]

export function visibleNav(role: string | undefined): NavItem[] {
  if (!role) return []
  return [...MAIN_NAV, ...BOTTOM_NAV].filter((n) =>
    n.roles.includes(role as NavItem['roles'][number]),
  )
}

export function visibleMainNav(role: string | undefined): NavItem[] {
  if (!role) return []
  return MAIN_NAV.filter((n) => n.roles.includes(role as NavItem['roles'][number]))
}

export function visibleBottomNav(role: string | undefined): NavItem[] {
  if (!role) return []
  return BOTTOM_NAV.filter((n) => n.roles.includes(role as NavItem['roles'][number]))
}

/** Top-bar chip showing the project the user is currently working on. */
function ActiveProjectBadge() {
  const { activeProject, setActiveProject } = useAuth()
  if (!activeProject) return null
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
        פרויקט:
      </span>
      <span
        className="tact-badge tact-badge-on"
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
      >
        {activeProject.name}
        <button
          onClick={() => setActiveProject(null)}
          title="בטל בחירת פרויקט"
          style={{
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: 'inherit',
            font: 'inherit',
            lineHeight: 1,
            padding: 0,
          }}
        >
          ✕
        </button>
      </span>
    </div>
  )
}

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'מנהל-על',
  company_admin: 'אדמין חברה',
  company_user: 'משתמש',
  end_customer: 'דייר',
}

type Props = {
  current: NavKey
  onNavigate: (k: NavKey) => void
  children: ReactNode
}

export default function AppShell({ current, onNavigate, children }: Props) {
  const { user, logout } = useAuth()
  const mainItems = visibleMainNav(user?.role)
  const bottomItems = visibleBottomNav(user?.role)

  function renderNavButton(it: NavItem) {
    const active = it.key === current
    return (
      <button
        key={it.key}
        onClick={() => onNavigate(it.key)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 12px',
          borderRadius: 10,
          border: '1px solid transparent',
          background: active ? 'var(--color-primary)' : 'transparent',
          color: active ? 'var(--color-text-white)' : 'var(--color-text)',
          fontWeight: active ? 600 : 500,
          fontSize: '0.92rem',
          cursor: 'pointer',
          textAlign: 'start',
          transition: 'background .15s, color .15s',
          font: 'inherit',
          width: '100%',
        }}
        onMouseEnter={(e) => {
          if (!active)
            (e.currentTarget as HTMLButtonElement).style.background =
              'rgba(31,58,95,0.08)'
        }}
        onMouseLeave={(e) => {
          if (!active)
            (e.currentTarget as HTMLButtonElement).style.background = 'transparent'
        }}
      >
        <TactIcon name={it.icon} size={18} />
        {it.label}
      </button>
    )
  }

  return (
    <div className="tact-aurora" style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: 240,
          background: 'var(--color-bg-white)',
          borderInlineStart: '1px solid var(--color-border)',
          padding: '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        <div style={{ padding: '6px 8px 18px' }}>
          <TactLogo word="cmm" size={1.05} />
        </div>

        {mainItems.map(renderNavButton)}

        <div style={{ marginTop: 'auto', borderTop: '1px solid var(--color-border)', paddingTop: 14 }}>
          <div style={{ fontSize: '0.85rem', fontWeight: 600 }}>{user?.full_name}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: 4 }}>
            {ROLE_LABEL[user?.role || '']}
          </div>
          {user?.company_name && (
            <div style={{ fontSize: '0.75rem', color: 'var(--color-text-light)', marginBottom: 10 }}>
              {user.company_name}
            </div>
          )}

          {bottomItems.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 10 }}>
              {bottomItems.map(renderNavButton)}
            </div>
          )}

          <button
            onClick={logout}
            className="tact-btn tact-btn-ghost"
            style={{ width: '100%', padding: '8px 12px', fontSize: '0.85rem' }}
          >
            יציאה
          </button>
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            background: 'var(--color-bg-white)',
            borderBottom: '1px solid var(--color-border)',
            padding: '14px 28px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <h1 style={{ fontSize: '1.05rem', color: 'var(--color-primary)', fontWeight: 700 }}>
            {[...mainItems, ...bottomItems].find((i) => i.key === current)?.label || ''}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <CompanyPicker />
            <ActiveProjectBadge />
          </div>
        </div>
        <div style={{ padding: '24px 28px', flex: 1 }}>{children}</div>
      </main>
    </div>
  )
}

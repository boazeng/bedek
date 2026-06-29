import { useState } from 'react'
import { AuthProvider, useAuth } from './lib/AuthContext'
import { DialogProvider } from './components/Dialog'
import AppShell, { visibleNav, type NavKey } from './components/AppShell'
import LoginPage from './pages/LoginPage'
import DashboardPage from './pages/DashboardPage'
import CompaniesPage from './pages/CompaniesPage'
import UsersPage from './pages/UsersPage'
import ProjectsPage from './pages/ProjectsPage'
import LocationsPage from './pages/LocationsPage'
import AdminPage from './pages/AdminPage'
import SystemAdminPage from './pages/SystemAdminPage'
import ProfessionalsPage from './pages/ProfessionalsPage'
import CompanyProfessionalsPage from './pages/CompanyProfessionalsPage'
import ProjectEditorPage from './pages/ProjectEditorPage'
import MalfunctionsPage from './pages/MalfunctionsPage'
import OpenMalfunctionPage from './pages/OpenMalfunctionPage'
import UnitDefectsPage from './pages/UnitDefectsPage'

// Pages reachable only from inside SystemAdminPage — not in the sidebar but
// still valid as `current`. Gated implicitly by access to system_admin.
const SYSTEM_ADMIN_SUBPAGES: NavKey[] = [
  'companies',
  'system_users',
  'professionals',
]
// Sub-pages of the company admin (ניהול חברה).
const ADMIN_SUBPAGES: NavKey[] = ['company_users', 'locations', 'company_professionals']
const MALFUNCTION_SUBPAGES: NavKey[] = ['unit_defects']

/** Parses the URL for stand-alone editor routes that open in their own tab. */
type EditorRoute =
  | { kind: 'project-edit'; id: number }
  | null

function readEditorRoute(): EditorRoute {
  const path = window.location.pathname.replace(/\/+$/, '')
  const p = path.match(/^\/projects\/edit\/(\d+)$/)
  if (p) return { kind: 'project-edit', id: parseInt(p[1], 10) }
  return null
}

function ProtectedShell() {
  const { user, loading } = useAuth()
  const [current, setCurrent] = useState<NavKey>('dashboard')
  const [unitDefectsCtx, setUnitDefectsCtx] = useState<{ projectId: number; unitId: number } | null>(null)

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <span style={{ color: 'var(--color-text-light)' }}>טוען…</span>
      </div>
    )
  }
  if (!user) return <LoginPage />

  const nav = visibleNav(user.role)
  const isValid =
    nav.some((n) => n.key === current) ||
    SYSTEM_ADMIN_SUBPAGES.includes(current) ||
    ADMIN_SUBPAGES.includes(current) ||
    MALFUNCTION_SUBPAGES.includes(current)
  const safe: NavKey = isValid ? current : nav[0]?.key ?? 'dashboard'

  return (
    <AppShell current={safe} onNavigate={setCurrent}>
      {safe === 'dashboard' && <DashboardPage />}
      {safe === 'open_malfunction' && <OpenMalfunctionPage />}
      {safe === 'companies' && <CompaniesPage />}
      {safe === 'system_users' && <UsersPage scope="system" />}
      {safe === 'company_users' && <UsersPage scope="company" />}
      {safe === 'projects' && <ProjectsPage />}
      {safe === 'locations' && <LocationsPage onNavigate={setCurrent} />}
      {safe === 'admin' && <AdminPage onNavigate={setCurrent} />}
      {safe === 'system_admin' && <SystemAdminPage onNavigate={setCurrent} />}
      {safe === 'professionals' && <ProfessionalsPage onNavigate={setCurrent} />}
      {safe === 'company_professionals' && <CompanyProfessionalsPage onNavigate={setCurrent} />}
      {safe === 'malfunctions' && (
        <MalfunctionsPage
          onOpenUnit={(pid, uid) => {
            setUnitDefectsCtx({ projectId: pid, unitId: uid })
            setCurrent('unit_defects')
          }}
        />
      )}
      {safe === 'unit_defects' && unitDefectsCtx && (
        <UnitDefectsPage
          projectId={unitDefectsCtx.projectId}
          unitId={unitDefectsCtx.unitId}
          onNavigate={setCurrent}
        />
      )}
    </AppShell>
  )
}

export default function App() {
  const editorRoute = readEditorRoute()
  return (
    <AuthProvider>
      <DialogProvider>
        {editorRoute?.kind === 'project-edit' ? (
          <ProjectEditorPage projectId={editorRoute.id} />
        ) : (
          <ProtectedShell />
        )}
      </DialogProvider>
    </AuthProvider>
  )
}

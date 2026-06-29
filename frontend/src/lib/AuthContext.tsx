import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  Auth,
  clearToken,
  setToken,
  getActiveCompanyId,
  setActiveCompanyId,
  getActiveProject,
  setActiveProject as persistActiveProject,
  getWorkScope,
  setWorkScope as persistWorkScope,
  EMPTY_WORK_SCOPE,
  type ActiveProject,
  type WorkScope,
  type CurrentUser,
} from './api'

type AuthState = {
  user: CurrentUser | null
  loading: boolean
  /** For super_admin: the company they're currently inspecting. Null for non-super. */
  activeCompanyId: number | null
  /** The project the user is currently working on (global selection). */
  activeProject: ActiveProject | null
  /** The building → entrance → unit the user is currently working on. */
  workScope: WorkScope
  loginAs: (email: string) => Promise<void>
  loginWithPassword: (email: string, password: string) => Promise<void>
  loginWithGoogle: (credential: string) => Promise<void>
  logout: () => void
  setActiveCompany: (id: number | null) => void
  setActiveProject: (p: ActiveProject | null) => void
  setWorkScope: (s: WorkScope) => void
  refresh: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCompanyId, setActiveCompanyIdState] = useState<number | null>(
    getActiveCompanyId(),
  )
  const [activeProject, setActiveProjectState] = useState<ActiveProject | null>(
    getActiveProject(),
  )
  const [workScope, setWorkScopeState] = useState<WorkScope>(getWorkScope())

  const setWorkScope = useCallback((s: WorkScope) => {
    persistWorkScope(s)
    setWorkScopeState(s)
  }, [])

  const refresh = useCallback(async () => {
    try {
      const me = await Auth.me()
      setUser(me)
    } catch {
      setUser(null)
      clearToken()
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function applyLogin(me: CurrentUser, access_token: string) {
    setToken(access_token)
    setUser(me)
    // Fresh session — drop any project carried over from a previous login.
    persistActiveProject(null)
    setActiveProjectState(null)
    persistWorkScope(EMPTY_WORK_SCOPE)
    setWorkScopeState(EMPTY_WORK_SCOPE)
    // For non-super_admin set their own company as active; super_admin must pick.
    if (me.role !== 'super_admin' && me.company_id) {
      setActiveCompanyId(me.company_id)
      setActiveCompanyIdState(me.company_id)
    } else {
      setActiveCompanyId(null)
      setActiveCompanyIdState(null)
    }
  }

  const loginAs = useCallback(async (email: string) => {
    const { access_token, user: me } = await Auth.devLogin(email)
    applyLogin(me, access_token)
  }, [])

  const loginWithPassword = useCallback(
    async (email: string, password: string) => {
      const { access_token, user: me } = await Auth.login(email, password)
      applyLogin(me, access_token)
    },
    [],
  )

  const loginWithGoogle = useCallback(async (credential: string) => {
    const { access_token, user: me } = await Auth.google(credential)
    applyLogin(me, access_token)
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setActiveCompanyIdState(null)
    setActiveProjectState(null)
    setWorkScopeState(EMPTY_WORK_SCOPE)
  }, [])

  const setActiveProject = useCallback((p: ActiveProject | null) => {
    persistActiveProject(p)
    setActiveProjectState(p)
    // Switching projects invalidates the building/entrance/unit selection.
    persistWorkScope(EMPTY_WORK_SCOPE)
    setWorkScopeState(EMPTY_WORK_SCOPE)
  }, [])

  const setActiveCompany = useCallback((id: number | null) => {
    setActiveCompanyId(id)
    setActiveCompanyIdState(id)
    // A project belongs to one company — switching tenant invalidates it.
    persistActiveProject(null)
    setActiveProjectState(null)
    persistWorkScope(EMPTY_WORK_SCOPE)
    setWorkScopeState(EMPTY_WORK_SCOPE)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      activeCompanyId,
      activeProject,
      workScope,
      loginAs,
      loginWithPassword,
      loginWithGoogle,
      logout,
      setActiveCompany,
      setActiveProject,
      setWorkScope,
      refresh,
    }),
    [user, loading, activeCompanyId, activeProject, workScope, loginAs, loginWithPassword, loginWithGoogle, logout, setActiveCompany, setActiveProject, setWorkScope, refresh],
  )

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthCtx)
  if (!ctx) throw new Error('useAuth must be inside AuthProvider')
  return ctx
}

/** Resolves which company_id the current view should target. Returns null when
 * the user is super_admin and hasn't picked one yet — pages should show a picker.
 */
export function useEffectiveCompanyId(): number | null {
  const { user, activeCompanyId } = useAuth()
  if (!user) return null
  if (user.role === 'super_admin') return activeCompanyId
  return user.company_id
}

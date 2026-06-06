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
  type CurrentUser,
} from './api'

type AuthState = {
  user: CurrentUser | null
  loading: boolean
  /** For super_admin: the company they're currently inspecting. Null for non-super. */
  activeCompanyId: number | null
  loginAs: (email: string) => Promise<void>
  logout: () => void
  setActiveCompany: (id: number | null) => void
  refresh: () => Promise<void>
}

const AuthCtx = createContext<AuthState | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null)
  const [loading, setLoading] = useState(true)
  const [activeCompanyId, setActiveCompanyIdState] = useState<number | null>(
    getActiveCompanyId(),
  )

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

  const loginAs = useCallback(async (email: string) => {
    const { access_token, user: me } = await Auth.devLogin(email)
    setToken(access_token)
    setUser(me)
    // For non-super_admin set their own company as active; super_admin must pick.
    if (me.role !== 'super_admin' && me.company_id) {
      setActiveCompanyId(me.company_id)
      setActiveCompanyIdState(me.company_id)
    } else {
      setActiveCompanyId(null)
      setActiveCompanyIdState(null)
    }
  }, [])

  const logout = useCallback(() => {
    clearToken()
    setUser(null)
    setActiveCompanyIdState(null)
  }, [])

  const setActiveCompany = useCallback((id: number | null) => {
    setActiveCompanyId(id)
    setActiveCompanyIdState(id)
  }, [])

  const value = useMemo<AuthState>(
    () => ({
      user,
      loading,
      activeCompanyId,
      loginAs,
      logout,
      setActiveCompany,
      refresh,
    }),
    [user, loading, activeCompanyId, loginAs, logout, setActiveCompany, refresh],
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

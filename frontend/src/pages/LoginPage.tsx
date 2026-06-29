import { useEffect, useRef, useState } from 'react'
import { Auth, type DevUserOption } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import { GOOGLE_CLIENT_ID } from '../lib/config'
import TactLogo from '../components/TactLogo'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'מנהל-על',
  company_admin: 'אדמין חברה',
  company_user: 'משתמש חברה',
  end_customer: 'דייר',
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 10,
  border: '1px solid var(--color-border)',
  background: 'var(--color-bg)',
  fontFamily: 'inherit',
  fontSize: '0.95rem',
  color: 'var(--color-text)',
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.8rem',
  fontWeight: 600,
  color: 'var(--color-text-light)',
  marginBottom: 6,
}

export default function LoginPage() {
  const { loginAs, loginWithPassword, loginWithGoogle } = useAuth()
  const [users, setUsers] = useState<DevUserOption[]>([])
  const [devAvailable, setDevAvailable] = useState<boolean | null>(null)
  const [selected, setSelected] = useState<string>('')
  const [email, setEmail] = useState<string>('')
  const [password, setPassword] = useState<string>('')
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)
  const googleBtnRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Auth.devUsers()
      .then((list) => {
        setUsers(list)
        setDevAvailable(true)
        if (list.length > 0) setSelected(list[0].email)
      })
      .catch(() => {
        // dev-login disabled in production → fall back to password form
        setDevAvailable(false)
      })
  }, [])

  // Load Google Identity Services and render the official "Sign in with Google"
  // button. Available on both dev and prod (just needs an existing user with
  // that Google email in the DB).
  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return

    function render() {
      const gsi = (window as { google?: any }).google
      if (!gsi?.accounts?.id || !googleBtnRef.current) return
      gsi.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (resp: { credential?: string }) => {
          if (!resp.credential) return
          setSubmitError(null)
          try {
            await loginWithGoogle(resp.credential)
          } catch (e) {
            setSubmitError(
              (e as Error)?.message || 'התחברות Google נכשלה',
            )
          }
        },
      })
      googleBtnRef.current.innerHTML = ''
      gsi.accounts.id.renderButton(googleBtnRef.current, {
        theme: 'outline',
        size: 'large',
        text: 'signin_with',
        width: 320,
        locale: 'he',
      })
    }

    if ((window as { google?: any }).google?.accounts?.id) {
      render()
      return
    }
    const existing = document.getElementById('gsi-client') as HTMLScriptElement | null
    if (existing) {
      existing.addEventListener('load', render)
      return
    }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.defer = true
    s.id = 'gsi-client'
    s.onload = render
    document.body.appendChild(s)
  }, [loginWithGoogle])

  async function onSubmitDev(e: React.FormEvent) {
    e.preventDefault()
    if (!selected) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await loginAs(selected)
    } catch (e) {
      setSubmitError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  async function onSubmitPassword(e: React.FormEvent) {
    e.preventDefault()
    if (!email || !password) return
    setSubmitting(true)
    setSubmitError(null)
    try {
      await loginWithPassword(email, password)
    } catch (e) {
      setSubmitError(String(e))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div
      className="tact-aurora"
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          background: 'var(--color-bg-white)',
          border: '1px solid var(--color-border)',
          borderRadius: 18,
          boxShadow: 'var(--shadow-lg)',
          padding: '36px 32px 30px',
          width: 'min(420px, 92vw)',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <TactLogo word="cmm" size={1.2} />
          <div style={{ color: 'var(--color-text-light)', fontSize: '0.92rem' }}>
            ניהול תקלות בבניין
          </div>
        </div>

        <h1 style={{ fontSize: '1.3rem', color: 'var(--color-primary)', marginBottom: 6 }}>
          התחברות
        </h1>
        <p style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginBottom: 18 }}>
          {devAvailable === false
            ? 'הזן את כתובת המייל והסיסמה'
            : 'סביבת פיתוח — בחר משתמש להתחבר כמוהו'}
        </p>

        {devAvailable === null && (
          <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
        )}

        {devAvailable === true && (
          <form onSubmit={onSubmitDev}>
            <label style={labelStyle}>משתמש</label>
            <select
              value={selected}
              onChange={(e) => setSelected(e.target.value)}
              style={inputStyle}
            >
              {users.map((u) => (
                <option key={u.id} value={u.email}>
                  {u.full_name} · {ROLE_LABEL[u.role] || u.role}
                  {u.company_name ? ` · ${u.company_name}` : ''} · {u.email}
                </option>
              ))}
            </select>

            <button
              type="submit"
              className="tact-btn tact-btn-primary"
              disabled={!selected || submitting}
              style={{ width: '100%', marginTop: 22 }}
            >
              {submitting ? 'מתחבר…' : 'התחבר'}
            </button>
          </form>
        )}

        {devAvailable === false && (
          <form onSubmit={onSubmitPassword}>
            <label style={labelStyle}>אימייל</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={{ ...inputStyle, marginBottom: 14 }}
              required
            />
            <label style={labelStyle}>סיסמה</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
              required
            />

            <button
              type="submit"
              className="tact-btn tact-btn-primary"
              disabled={!email || !password || submitting}
              style={{ width: '100%', marginTop: 22 }}
            >
              {submitting ? 'מתחבר…' : 'התחבר'}
            </button>
          </form>
        )}

        {submitError && (
          <div style={{ color: 'var(--color-accent)', marginTop: 12 }}>{submitError}</div>
        )}

        {GOOGLE_CLIENT_ID && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '20px 0 16px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
              <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>או</span>
              <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div ref={googleBtnRef} />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

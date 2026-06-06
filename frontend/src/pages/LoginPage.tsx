import { useEffect, useState } from 'react'
import { Auth, type DevUserOption } from '../lib/api'
import { useAuth } from '../lib/AuthContext'
import TactLogo from '../components/TactLogo'

const ROLE_LABEL: Record<string, string> = {
  super_admin: 'מנהל-על',
  company_admin: 'אדמין חברה',
  company_user: 'משתמש חברה',
  end_customer: 'דייר',
}

export default function LoginPage() {
  const { loginAs } = useAuth()
  const [users, setUsers] = useState<DevUserOption[]>([])
  const [selected, setSelected] = useState<string>('')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  useEffect(() => {
    Auth.devUsers()
      .then((list) => {
        setUsers(list)
        if (list.length > 0) setSelected(list[0].email)
      })
      .catch((e) => setLoadError(String(e)))
  }, [])

  async function onSubmit(e: React.FormEvent) {
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
          סביבת פיתוח — בחר משתמש להתחבר כמוהו
        </p>

        {loadError && (
          <div style={{ color: 'var(--color-accent)', marginBottom: 12 }}>{loadError}</div>
        )}

        <form onSubmit={onSubmit}>
          <label
            style={{
              display: 'block',
              fontSize: '0.8rem',
              fontWeight: 600,
              color: 'var(--color-text-light)',
              marginBottom: 6,
            }}
          >
            משתמש
          </label>
          <select
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '1px solid var(--color-border)',
              background: 'var(--color-bg)',
              fontFamily: 'inherit',
              fontSize: '0.95rem',
              color: 'var(--color-text)',
            }}
          >
            {users.map((u) => (
              <option key={u.id} value={u.email}>
                {u.full_name} · {ROLE_LABEL[u.role] || u.role}
                {u.company_name ? ` · ${u.company_name}` : ''} · {u.email}
              </option>
            ))}
          </select>

          {submitError && (
            <div style={{ color: 'var(--color-accent)', marginTop: 12 }}>{submitError}</div>
          )}

          <button
            type="submit"
            className="tact-btn tact-btn-primary"
            disabled={!selected || submitting}
            style={{ width: '100%', marginTop: 22 }}
          >
            {submitting ? 'מתחבר…' : 'התחבר'}
          </button>
        </form>
      </div>
    </div>
  )
}

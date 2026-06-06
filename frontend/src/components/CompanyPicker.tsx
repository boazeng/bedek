import { useEffect, useState } from 'react'
import { Companies, type Company } from '../lib/api'
import { useAuth } from '../lib/AuthContext'

/** Visible only for super_admin: lets them pick which tenant they are viewing. */
export default function CompanyPicker() {
  const { user, activeCompanyId, setActiveCompany } = useAuth()
  const [list, setList] = useState<Company[]>([])

  useEffect(() => {
    if (user?.role !== 'super_admin') return
    Companies.list()
      .then(setList)
      .catch(() => setList([]))
  }, [user?.role])

  if (!user) return null
  if (user.role !== 'super_admin') {
    return (
      <span className="tact-badge tact-badge-on">
        {user.company_name || 'ללא חברה'}
      </span>
    )
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--color-text-light)' }}>
        חברה פעילה:
      </span>
      <select
        value={activeCompanyId ?? ''}
        onChange={(e) =>
          setActiveCompany(e.target.value ? Number(e.target.value) : null)
        }
        style={{
          padding: '6px 12px',
          borderRadius: 999,
          border: '1px solid var(--color-border)',
          background: 'var(--color-bg)',
          fontFamily: 'inherit',
          fontSize: '0.85rem',
          color: 'var(--color-text)',
        }}
      >
        <option value="">— בחר —</option>
        {list.map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </select>
    </div>
  )
}

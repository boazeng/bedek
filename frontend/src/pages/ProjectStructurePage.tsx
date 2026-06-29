import { useEffect, useState } from 'react'
import { Projects, type Project } from '../lib/api'
import DataTable from '../components/DataTable'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'

/** Company-admin hub for building each project's physical structure.
 *  Reached from ניהול חברה. Picks a project, then opens the visual builder. */
export default function ProjectStructurePage() {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [rows, setRows] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const needsCompany = user?.role === 'super_admin' && !companyId

  useEffect(() => {
    if (needsCompany) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [user?.role, companyId])

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לבנות את מבנה הפרויקטים שלה</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          מבנה הפרויקטים
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          בחר פרויקט כדי לבנות את מבנהו — בניינים, כניסות, קומות ויחידות ממכר
        </div>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: 'שם הפרויקט', key: 'name' },
            { header: 'כתובת', key: 'address' },
          ]}
          actions={(r) => (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                onClick={() => window.open(`/projects/edit/${r.id}`, '_blank', 'noopener')}
                className="tact-btn tact-btn-primary"
                style={{ padding: '6px 14px', fontSize: '0.8rem' }}
                title="פתח את בונה המבנה בלשונית חדשה"
              >
                בנה מבנה
              </button>
            </div>
          )}
          empty="עדיין אין פרויקטים — צור פרויקט במסך 'פרויקטים' תחילה."
        />
      )}
    </div>
  )
}

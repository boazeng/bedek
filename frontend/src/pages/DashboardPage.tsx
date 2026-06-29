import { useEffect, useState } from 'react'
import KpiCard from '../components/KpiCard'
import ProjectCard from '../components/ProjectCard'
import { Dashboard, type DashboardResponse } from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'

export default function DashboardPage() {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [data, setData] = useState<DashboardResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (user?.role === 'super_admin' && !companyId) {
      setData(null)
      setError(null)
      return
    }
    setLoading(true)
    setError(null)
    Dashboard.fetch(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then(setData)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }, [companyId, user?.role])

  if (user?.role === 'super_admin' && !companyId) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לצפות בדף הבית</div>
        <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem', marginTop: 8 }}>
          השתמש ברשימה "חברה פעילה" שלמעלה.
        </div>
      </div>
    )
  }
  if (loading) return <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
  if (error) return <div style={{ color: 'var(--color-accent)' }}>{error}</div>
  if (!data) return null

  const { company, projects } = data
  const closedPct =
    company.total_defects > 0
      ? Math.round((company.done_defects / company.total_defects) * 100)
      : 0

  return (
    <div>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          {company.company_name}
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          תמונת מצב של הליקויים, החלוקה לפי סטטוס ומקור, וסיכום לכל פרויקט
        </div>
      </div>

      <section
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
        style={{ marginBottom: 30 }}
      >
        <KpiCard label="פרויקטים" value={company.total_projects} />
        <KpiCard label="יחידות ממכר" value={company.total_units} />
        <KpiCard
          label="סה״כ ליקויים"
          value={company.total_defects}
          sub={`${closedPct}% הסתיימו`}
        />
        <KpiCard
          label="פתוחים"
          value={company.open_defects}
          sub="לא כולל סגורים/בוטלו"
        />
        <KpiCard
          label="ממתינים לאישור"
          value={company.pending_manager}
          sub="להחלטת המנהל"
        />
        <KpiCard
          label="הסתיים"
          value={company.done_defects}
          sub={`מתוך ${company.total_defects}`}
        />
      </section>

      <section>
        <div
          style={{
            display: 'flex',
            alignItems: 'baseline',
            justifyContent: 'space-between',
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            פירוט לפי פרויקט
          </h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            {projects.length} פרויקטים
          </span>
        </div>
        {projects.length === 0 ? (
          <div className="tact-kpi" style={{ textAlign: 'center' }}>
            <div className="tact-kpi-label">אין עדיין פרויקטים</div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {projects.map((p) => (
              <ProjectCard key={p.project_id} project={p} />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

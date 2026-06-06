import { useEffect, useState } from 'react'
import {
  Malfunctions,
  Projects,
  type MalfunctionBuildingSummary,
  type Project,
  type UnitWithDefects,
} from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import DataTable from '../components/DataTable'
import { inputStyle } from '../components/Modal'

type Props = { onOpenUnit: (projectId: number, unitId: number) => void }

export default function MalfunctionsPage({ onOpenUnit }: Props) {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [buildings, setBuildings] = useState<MalfunctionBuildingSummary[]>([])
  const [buildingId, setBuildingId] = useState<number | null>(null)
  const [rows, setRows] = useState<UnitWithDefects[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loadingUnits, setLoadingUnits] = useState(false)

  const needsCompany = user?.role === 'super_admin' && !companyId

  useEffect(() => {
    if (needsCompany) return
    Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined)
      .then((p) => {
        setProjects(p)
        if (p.length && !projectId) setProjectId(p[0].id)
      })
      .catch((e) => setError(String(e)))
  }, [user?.role, companyId])

  useEffect(() => {
    if (!projectId) return
    setBuildings([])
    setBuildingId(null)
    Malfunctions.buildings(projectId)
      .then(setBuildings)
      .catch((e) => setError(String(e)))
  }, [projectId])

  useEffect(() => {
    if (!projectId) return
    setLoadingUnits(true)
    Malfunctions.unitsWithDefects(projectId, buildingId)
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoadingUnits(false))
  }, [projectId, buildingId])

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לצפות בתקלות</div>
      </div>
    )
  }

  const totalOpenDefects = rows.reduce((sum, r) => sum + r.open_defects, 0)

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          תקלות
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          מעקב אחר תקלות פתוחות לפי פרויקט, בניין ויחידה
        </div>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 12,
          marginBottom: 16,
          maxWidth: 720,
        }}
      >
        <label style={{ fontSize: '0.85rem' }}>
          <div style={{ marginBottom: 4, color: 'var(--color-text-light)' }}>פרויקט</div>
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
          >
            <option value="">— בחר פרויקט —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: '0.85rem' }}>
          <div style={{ marginBottom: 4, color: 'var(--color-text-light)' }}>בניין</div>
          <select
            value={buildingId ?? ''}
            onChange={(e) => setBuildingId(e.target.value ? Number(e.target.value) : null)}
            style={inputStyle}
            disabled={!projectId || buildings.length === 0}
          >
            <option value="">כל הבניינים</option>
            {buildings.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name} ({b.open_defects} תקלות)
              </option>
            ))}
          </select>
        </label>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      <div style={{ marginBottom: 10, fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
        {projectId && !loadingUnits && (
          <>
            <strong>{rows.length}</strong> יחידות · <strong>{totalOpenDefects}</strong> תקלות פתוחות
          </>
        )}
      </div>

      {loadingUnits ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: 'קומה',
              key: 'floor_name',
              width: 90,
              render: (r) => (
                <span style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
                  {r.floor_name || '—'}
                </span>
              ),
            },
            {
              header: 'יחידה',
              key: 'name',
              render: (r) => (
                <span style={{ fontWeight: 500 }}>{r.name}</span>
              ),
            },
            { header: 'כיוון', key: 'direction', width: 80, render: (r) => r.direction || '—' },
            {
              header: 'לקוח',
              key: 'customer_name',
              render: (r) => r.customer_name || <span style={{ color: 'var(--color-text-light)' }}>—</span>,
            },
            {
              header: 'תקלות פתוחות',
              key: 'open_defects',
              width: 130,
              align: 'center',
              render: (r) => (
                <span
                  className={`tact-badge ${r.open_defects > 0 ? 'tact-badge-new' : 'tact-badge-soon'}`}
                  style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.9rem' }}
                >
                  {r.open_defects}
                </span>
              ),
            },
          ]}
          actions={(r) => (
            <button
              onClick={() => projectId && onOpenUnit(projectId, r.id)}
              className="tact-btn tact-btn-primary"
              style={{ padding: '6px 14px', fontSize: '0.8rem' }}
            >
              צפה
            </button>
          )}
          empty={projectId ? 'אין יחידות בבניין זה' : 'בחר פרויקט להצגת היחידות'}
        />
      )}
    </div>
  )
}

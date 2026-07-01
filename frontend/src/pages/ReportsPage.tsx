import { Fragment, useEffect, useMemo, useState } from 'react'
import {
  CompanyProfessionals,
  Projects,
  ProjectTree,
  Reports,
  type CompanyProfessionalRow,
  type Project,
  type ProjectItemNode,
  type ReportResponse,
} from '../lib/api'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { inputStyle } from '../components/Modal'
import { buildReportHtml } from '../components/reportPrint'
import { groupReportRows } from '../lib/reportGroup'

const UNIT_TYPE_LABEL: Record<string, string> = {
  apartment: 'דירה',
  parking: 'חניה',
  storage: 'מחסן',
  shop: 'חנות',
  public_area: 'ציבורי',
}

export const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'pending_manager', label: 'ממתין לאישור מנהל' },
  { value: 'frozen', label: 'מוקפא' },
  { value: 'todo', label: 'לביצוע' },
  { value: 'negotiation', label: 'למו"מ מול הלקוח' },
  { value: 'done', label: 'הסתיים טיפול' },
  { value: 'cancelled', label: 'בוטל' },
]

export const SOURCE_OPTIONS: { value: string; label: string }[] = [
  { value: 'whatsapp', label: 'וואטסאפ' },
  { value: 'manual', label: 'ידני' },
  { value: 'bedek_report', label: 'דוח בדק' },
  { value: 'inspector_tour', label: 'סיור פיקוח' },
  { value: 'delivery_protocol', label: 'פרוטוקול מסירה' },
  { value: 'email', label: 'אימייל' },
]

type Filters = {
  buildingId: number | null
  entranceId: number | null
  unitId: number | null
  professional: string
  status: string
  source: string
}

const EMPTY: Filters = {
  buildingId: null,
  entranceId: null,
  unitId: null,
  professional: '',
  status: '',
  source: '',
}

const labelStyle: React.CSSProperties = { fontSize: '0.8rem' }
const labelTextStyle: React.CSSProperties = { marginBottom: 4, color: 'var(--color-text-light)' }

export default function ReportsPage() {
  const { user, activeProject } = useAuth()
  const companyId = useEffectiveCompanyId()
  const [projects, setProjects] = useState<Project[]>([])
  const [projectId, setProjectId] = useState<number | null>(null)
  const [tree, setTree] = useState<ProjectItemNode[]>([])
  const [professionals, setProfessionals] = useState<CompanyProfessionalRow[]>([])
  const [filter, setFilter] = useState<Filters>(EMPTY)
  const [report, setReport] = useState<ReportResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  const needsCompany = user?.role === 'super_admin' && !companyId

  // Cascading option lists, derived from the project tree.
  const buildings = useMemo(() => tree.filter((n) => n.kind === 'building'), [tree])
  const entrances = useMemo(() => {
    const b = buildings.find((x) => x.id === filter.buildingId)
    return b ? b.children.filter((n) => n.kind === 'entrance') : []
  }, [buildings, filter.buildingId])
  const units = useMemo(() => {
    const b = buildings.find((x) => x.id === filter.buildingId)
    const e = b?.children.find((x) => x.id === filter.entranceId)
    if (!e) return [] as { node: ProjectItemNode; floor: string }[]
    const out: { node: ProjectItemNode; floor: string }[] = []
    for (const floor of e.children)
      for (const u of floor.children) if (u.kind === 'unit') out.push({ node: u, floor: floor.name })
    return out
  }, [buildings, filter.buildingId, filter.entranceId])

  useEffect(() => {
    if (needsCompany) return
    const cid = user?.role === 'super_admin' ? companyId ?? undefined : undefined
    Projects.list(cid)
      .then((p) => {
        setProjects(p)
        if (p.length && !projectId) {
          const active = activeProject && p.find((x) => x.id === activeProject.id)
          setProjectId(active ? active.id : p[0].id)
        }
      })
      .catch((e) => setError(String(e)))
    CompanyProfessionals.list(cid)
      .then((rows) => setProfessionals(rows.filter((r) => r.is_active)))
      .catch(() => setProfessionals([]))
  }, [user?.role, companyId])

  useEffect(() => {
    if (!projectId) return
    setFilter(EMPTY)
    setReport(null)
    ProjectTree.list(projectId)
      .then(setTree)
      .catch((e) => setError(String(e)))
  }, [projectId])

  const project = projects.find((p) => p.id === projectId) || null

  function generate() {
    if (!projectId) return
    setLoading(true)
    setError(null)
    Reports.malfunctions({
      projectId,
      buildingId: filter.buildingId,
      entranceId: filter.entranceId,
      unitId: filter.unitId,
      professional: filter.professional || null,
      status: filter.status || null,
      source: filter.source || null,
    })
      .then(setReport)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }

  function exportPdf() {
    if (!report) return
    const html = buildReportHtml(report)
    const w = window.open('', '_blank')
    if (!w) {
      setError('הדפדפן חסם את חלון ההדפסה. אפשר חלונות קופצים ונסה שוב.')
      return
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי להפיק דוחות</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
          דוחות
        </h2>
        <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
          סינון תקלות לפי פרויקט, בניין, כניסה, דירה, בעל מקצוע, סטטוס ומקור — והפקת דוח PDF
        </div>
      </div>

      {/* Project selector */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 14, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <label style={{ fontSize: '0.85rem' }}>
          <div style={labelTextStyle}>פרויקט</div>
          <select
            value={projectId ?? ''}
            onChange={(e) => setProjectId(e.target.value ? Number(e.target.value) : null)}
            style={{ ...inputStyle, minWidth: 240 }}
          >
            <option value="">— בחר פרויקט —</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* Filters */}
      {projectId && (
        <div
          style={{
            display: 'flex',
            gap: 10,
            marginBottom: 14,
            alignItems: 'flex-end',
            flexWrap: 'wrap',
            background: 'var(--color-bg-white)',
            border: '1px solid var(--color-border)',
            borderRadius: 12,
            padding: '12px 14px',
          }}
        >
          <label style={labelStyle}>
            <div style={labelTextStyle}>בניין</div>
            <select
              value={filter.buildingId ?? ''}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  buildingId: e.target.value ? Number(e.target.value) : null,
                  entranceId: null,
                  unitId: null,
                }))
              }
              style={{ ...inputStyle, minWidth: 140 }}
            >
              <option value="">הכל</option>
              {buildings.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>כניסה</div>
            <select
              value={filter.entranceId ?? ''}
              disabled={!filter.buildingId}
              onChange={(e) =>
                setFilter((f) => ({
                  ...f,
                  entranceId: e.target.value ? Number(e.target.value) : null,
                  unitId: null,
                }))
              }
              style={{ ...inputStyle, minWidth: 120 }}
            >
              <option value="">הכל</option>
              {entrances.map((en) => (
                <option key={en.id} value={en.id}>
                  {en.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>דירה</div>
            <select
              value={filter.unitId ?? ''}
              disabled={!filter.entranceId}
              onChange={(e) =>
                setFilter((f) => ({ ...f, unitId: e.target.value ? Number(e.target.value) : null }))
              }
              style={{ ...inputStyle, minWidth: 160 }}
            >
              <option value="">הכל</option>
              {units.map(({ node, floor }) => (
                <option key={node.id} value={node.id}>
                  {UNIT_TYPE_LABEL[node.unit_type || ''] || 'יחידה'} {node.short_code || node.number || ''} · {floor}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>בעל מקצוע</div>
            <select
              value={filter.professional}
              onChange={(e) => setFilter((f) => ({ ...f, professional: e.target.value }))}
              style={{ ...inputStyle, minWidth: 150 }}
            >
              <option value="">הכל</option>
              {professionals.map((p) => (
                <option key={p.id} value={p.name}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>סטטוס</div>
            <select
              value={filter.status}
              onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value }))}
              style={{ ...inputStyle, minWidth: 150 }}
            >
              <option value="">הכל</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <label style={labelStyle}>
            <div style={labelTextStyle}>מקור</div>
            <select
              value={filter.source}
              onChange={(e) => setFilter((f) => ({ ...f, source: e.target.value }))}
              style={{ ...inputStyle, minWidth: 140 }}
            >
              <option value="">הכל</option>
              {SOURCE_OPTIONS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <span style={{ flex: 1 }} />
          <button className="tact-btn tact-btn-ghost" onClick={() => setFilter(EMPTY)}>
            נקה סינון
          </button>
          <button className="tact-btn tact-btn-primary" onClick={generate} disabled={loading}>
            {loading ? 'מפיק…' : 'הפק דוח'}
          </button>
        </div>
      )}

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      {report && (
        <>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 12,
              marginBottom: 10,
              flexWrap: 'wrap',
            }}
          >
            <div style={{ fontSize: '0.9rem' }}>
              <strong>{report.total}</strong> תקלות תואמות את הסינון
            </div>
            <span style={{ flex: 1 }} />
            <button
              className="tact-btn tact-btn-primary"
              onClick={exportPdf}
              disabled={report.total === 0}
            >
              הפק PDF
            </button>
          </div>

          {report.total === 0 ? (
            <div className="tact-kpi" style={{ textAlign: 'center', padding: '40px 20px' }}>
              <div className="tact-kpi-label">לא נמצאו תקלות התואמות את הסינון</div>
            </div>
          ) : (
            <div>
              {groupReportRows(report.rows).map((sec) => (
                <section key={sec.key} style={{ marginBottom: 18 }}>
                  <div
                    style={{
                      fontWeight: 700,
                      color: '#fff',
                      background: 'var(--color-primary)',
                      padding: '6px 12px',
                      borderRadius: 8,
                      fontSize: '0.92rem',
                    }}
                  >
                    {[sec.buildingName, sec.entranceName].filter(Boolean).join(' · ') || '—'}
                  </div>
                  {sec.units.map((u) => (
                    <div key={`${sec.key}-${u.unitId ?? 'none'}`} style={{ margin: '8px 0 12px' }}>
                      <div style={{ fontWeight: 700, color: 'var(--color-primary)', margin: '8px 2px 4px', fontSize: '0.85rem' }}>
                        {[u.unitName || 'ללא יחידה', u.floorName].filter(Boolean).join(' · ')}{' '}
                        <span style={{ color: 'var(--color-text-light)', fontWeight: 400, fontSize: '0.78rem' }}>
                          ({u.rows.length})
                        </span>
                      </div>
                      <table
                        style={{
                          width: '100%',
                          borderCollapse: 'collapse',
                          background: 'var(--color-bg-white)',
                          fontSize: '0.82rem',
                          border: '1px solid var(--color-border)',
                          borderRadius: 10,
                          overflow: 'hidden',
                        }}
                      >
                        <thead>
                          <tr style={{ background: 'var(--color-bg)', textAlign: 'right' }}>
                            {['מספר', 'מיקום', 'תיאור התקלה', 'מקצוע', 'סטטוס'].map((h) => (
                              <th key={h} style={thStyle}>
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {u.rows.map((r) => (
                            <Fragment key={r.id}>
                              <tr style={{ borderTop: '1px solid var(--color-border)' }}>
                                <td style={{ ...tdStyle, whiteSpace: 'nowrap', fontWeight: 600 }}>{r.short_number || ''}</td>
                                <td style={tdStyle}>{r.location_name || ''}</td>
                                <td style={{ ...tdStyle, maxWidth: 360 }}>{r.description}</td>
                                <td style={tdStyle}>{r.professional || ''}</td>
                                <td style={tdStyle}>{r.status_label}</td>
                              </tr>
                              {r.activities.length > 0 && (
                                <tr>
                                  <td />
                                  <td colSpan={4} style={{ ...tdStyle, background: '#FCFBF7' }}>
                                    <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--color-text-light)', marginBottom: 2 }}>
                                      פעילויות
                                    </div>
                                    <ul style={{ margin: 0, paddingInlineStart: 16 }}>
                                      {r.activities.map((a, i) => (
                                        <li key={i} style={{ fontSize: '0.74rem', color: '#4a4a4a' }}>
                                          <span style={{ color: 'var(--color-text-light)' }}>
                                            {[a.occurred_on, a.performed_by].filter(Boolean).join(' · ')}
                                          </span>{' '}
                                          {a.action}
                                          {a.notes ? ` — ${a.notes}` : ''}
                                        </li>
                                      ))}
                                    </ul>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ))}
                </section>
              ))}
            </div>
          )}
        </>
      )}

      {!report && projectId && !loading && (
        <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
          בחר סינון (או השאר ריק לכל התקלות) ולחץ "הפק דוח".
        </div>
      )}
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '8px 10px',
  fontWeight: 700,
  color: 'var(--color-primary)',
  whiteSpace: 'nowrap',
}
const tdStyle: React.CSSProperties = {
  padding: '7px 10px',
  verticalAlign: 'top',
}

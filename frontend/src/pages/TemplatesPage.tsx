import { useEffect, useState } from 'react'
import { Templates, type TemplateListRow, type TemplateScope } from '../lib/api'
import DataTable from '../components/DataTable'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useConfirm } from '../components/Dialog'
import type { NavKey } from '../components/AppShell'

type Props = {
  onNavigate: (k: NavKey) => void
  /** 'system' = templates with no company (managed under ניהול מערכת).
   *  'company' = templates of the active company (managed under ניהול). */
  scope: TemplateScope
}

function openEditorTab(url: string) {
  window.open(url, '_blank', 'noopener')
}


const arrowBtnStyle = (enabled: boolean): React.CSSProperties => ({
  width: 22,
  height: 16,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: 'transparent',
  border: '1px solid var(--color-border)',
  borderRadius: 4,
  cursor: enabled ? 'pointer' : 'not-allowed',
  color: enabled ? 'var(--color-primary)' : 'var(--color-text-light)',
  opacity: enabled ? 1 : 0.35,
  fontFamily: 'inherit',
  fontSize: '0.62rem',
  padding: 0,
  lineHeight: 1,
})

export default function TemplatesPage({ onNavigate, scope }: Props) {
  const { user } = useAuth()
  const confirm = useConfirm()
  const companyId = useEffectiveCompanyId()
  const isCompany = scope === 'company'
  // Edit rights: super_admin always; company_admin can edit company-scope only.
  const canWrite = isCompany
    ? user?.role === 'super_admin' || user?.role === 'company_admin'
    : user?.role === 'super_admin'
  // For super_admin in company scope, the active company must be picked.
  const needsCompany =
    isCompany && user?.role === 'super_admin' && !companyId
  const [rows, setRows] = useState<TemplateListRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function load() {
    if (needsCompany) {
      setRows([])
      setLoading(false)
      return
    }
    setLoading(true)
    Templates.list({ scope, companyId: companyId ?? undefined })
      .then(setRows)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [scope, companyId])

  useEffect(() => {
    const onFocus = () => load()
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [])

  function openCreate() {
    // Pass scope to the editor so the new template saves with the right
    // company_id. For 'company' scope, the editor needs the active company too.
    const params = new URLSearchParams({ scope })
    if (isCompany && companyId) params.set('company_id', String(companyId))
    openEditorTab(`/templates/new?${params.toString()}`)
  }
  function openEdit(t: TemplateListRow) {
    openEditorTab(`/templates/edit/${t.id}`)
  }
  async function remove(t: TemplateListRow) {
    const ok = await confirm({
      title: 'מחיקת תבנית',
      message: `למחוק את התבנית "${t.name}"? פעולה זו לא ניתנת לביטול.`,
      variant: 'danger',
      confirmLabel: 'מחק',
    })
    if (!ok) return
    try {
      await Templates.remove(t.id)
      load()
    } catch (e) {
      setError(String(e))
    }
  }
  async function duplicate(t: TemplateListRow) {
    try {
      await Templates.duplicate(t.id)
      load()
    } catch (e) {
      setError(String(e))
    }
  }
  async function move(t: TemplateListRow, dir: 'up' | 'down') {
    if (busy) return
    const idx = rows.findIndex((r) => r.id === t.id)
    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    if (idx === -1 || swapIdx < 0 || swapIdx >= rows.length) return
    const newOrder = [...rows]
    ;[newOrder[idx], newOrder[swapIdx]] = [newOrder[swapIdx], newOrder[idx]]
    setBusy(true)
    try {
      await Templates.reorder(newOrder.map((r) => r.id))
      const fresh = await Templates.list({ scope, companyId: companyId ?? undefined })
      setRows(fresh)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div>
      <div style={{ marginBottom: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            {isCompany ? 'תבניות חברה' : 'תבניות מערכת'}
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            {isCompany
              ? 'תבניות ששייכות לחברה בלבד — נראות רק לפרויקטים של אותה חברה'
              : 'תבניות מערכת משותפות לכל החברות במערכת'}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            className="tact-btn tact-btn-ghost"
            onClick={() => onNavigate(isCompany ? 'admin' : 'system_admin')}
            style={{ padding: '8px 16px', fontSize: '0.85rem' }}
          >
            ← חזרה {isCompany ? 'לניהול' : 'לניהול מערכת'}
          </button>
          {canWrite && (
            <button onClick={openCreate} className="tact-btn tact-btn-primary">
              + תבנית חדשה
            </button>
          )}
        </div>
      </div>

      {!canWrite && (
        <div className="tact-badge tact-badge-soon" style={{ marginBottom: 12 }}>
          תצוגה בלבד
        </div>
      )}
      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}

      {needsCompany ? (
        <div className="tact-kpi" style={{ textAlign: 'center' }}>
          <div className="tact-kpi-label">בחר חברה כדי לראות את התבניות שלה</div>
        </div>
      ) : loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            {
              header: 'מזהה',
              key: 'id',
              width: 80,
              render: (r) => (
                <span
                  style={{
                    fontFamily: 'var(--font-family-en)',
                    fontSize: '0.82rem',
                    fontWeight: 600,
                    color: 'var(--color-text-light)',
                    background: 'var(--color-bg)',
                    padding: '3px 9px',
                    borderRadius: 6,
                    border: '1px solid var(--color-border)',
                  }}
                >
                  T{String(r.id).padStart(3, '0')}
                </span>
              ),
            },
            {
              header: 'קוד',
              key: 'code',
              width: 110,
              render: (r) =>
                r.code ? (
                  <code style={{ fontFamily: 'var(--font-family-en)', fontSize: '0.85rem' }}>
                    {r.code}
                  </code>
                ) : (
                  <span style={{ color: 'var(--color-text-light)' }}>—</span>
                ),
            },
            {
              header: 'סדר',
              key: 'sort_order',
              width: 90,
              render: (r) => {
                const idx = rows.findIndex((x) => x.id === r.id)
                const canUp = idx > 0
                const canDown = idx < rows.length - 1
                return (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span style={{ minWidth: 18, fontFamily: 'var(--font-family-en)', fontWeight: 600, color: 'var(--color-primary)' }}>
                      {idx + 1}
                    </span>
                    {canWrite && (
                      <div style={{ display: 'inline-flex', gap: 2 }}>
                        <button style={arrowBtnStyle(canUp && !busy)} disabled={!canUp || busy} onClick={() => move(r, 'up')} title="העלה">▲</button>
                        <button style={arrowBtnStyle(canDown && !busy)} disabled={!canDown || busy} onClick={() => move(r, 'down')} title="הורד">▼</button>
                      </div>
                    )}
                  </div>
                )
              },
            },
            { header: 'שם', key: 'name' },
            {
              header: 'ישות מורכבת',
              key: 'entity_type_name',
              width: 160,
              render: (r) =>
                r.entity_type_name ? (
                  <span className="tact-badge tact-badge-on">{r.entity_type_name}</span>
                ) : (
                  <span style={{ color: 'var(--color-accent)', fontSize: '0.82rem' }}>
                    ⚠ ללא ישות
                  </span>
                ),
            },
            {
              header: 'פריטים',
              key: 'item_count',
              width: 80,
              render: (r) => (
                <span style={{ fontFamily: 'var(--font-family-en)', fontWeight: 600 }}>
                  {r.item_count}
                </span>
              ),
            },
            {
              header: 'סטטוס',
              key: 'is_active',
              width: 90,
              render: (r) => (
                <span className={`tact-badge ${r.is_active ? 'tact-badge-pos' : 'tact-badge-soon'}`}>
                  {r.is_active ? 'פעיל' : 'לא פעיל'}
                </span>
              ),
            },
          ]}
          actions={
            canWrite
              ? (r) => (
                  <div style={{ display: 'flex', gap: 4, justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                    <button onClick={() => openEdit(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem' }}>
                      ערוך
                    </button>
                    <button onClick={() => duplicate(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem' }} title="שכפול">
                      שכפל
                    </button>
                    <button onClick={() => remove(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 12px', fontSize: '0.78rem', color: 'var(--color-accent)' }}>
                      מחק
                    </button>
                  </div>
                )
              : undefined
          }
          empty='עדיין אין תבניות. לחץ "+ תבנית חדשה" כדי להתחיל.'
        />
      )}
    </div>
  )
}

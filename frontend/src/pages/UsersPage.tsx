import { useEffect, useMemo, useState } from 'react'
import {
  Projects,
  Users,
  type Project,
  type UserRole,
  type UserRow,
  type UserScope,
} from '../lib/api'
import DataTable from '../components/DataTable'
import Modal, { Field, inputStyle } from '../components/Modal'
import { useAuth, useEffectiveCompanyId } from '../lib/AuthContext'
import { useAlert, useConfirm } from '../components/Dialog'

const ROLE_LABEL: Record<UserRole, string> = {
  super_admin: 'מנהל-על',
  company_admin: 'אדמין חברה',
  company_user: 'משתמש חברה',
  end_customer: 'דייר',
}

type FormState = {
  full_name: string
  email: string
  phone: string
  role: UserRole
  has_all_projects: boolean
  project_ids: number[]
  is_active: boolean
}

const EMPTY_FORM: FormState = {
  full_name: '',
  email: '',
  phone: '',
  role: 'company_user',
  has_all_projects: false,
  project_ids: [],
  is_active: true,
}

type Props = {
  /** 'system' = super_admin users only (managed under ניהול מערכת).
   *  'company' = company-scoped users (managed under ניהול חברה). */
  scope: UserScope
}

export default function UsersPage({ scope }: Props) {
  const { user } = useAuth()
  const companyId = useEffectiveCompanyId()
  const confirm = useConfirm()
  const alert = useAlert()
  const isSystem = scope === 'system'
  const [rows, setRows] = useState<UserRow[]>([])
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<UserRow | null>(null)
  const [form, setForm] = useState<FormState>({
    ...EMPTY_FORM,
    role: isSystem ? 'super_admin' : 'company_user',
  })
  const [saveErr, setSaveErr] = useState<string | null>(null)

  // System scope is global (no company picker). Company scope needs a company.
  const needsCompany = !isSystem && user?.role === 'super_admin' && !companyId

  function load() {
    if (needsCompany) {
      setRows([])
      setProjects([])
      setLoading(false)
      return
    }
    setLoading(true)
    Promise.all([
      Users.list({ scope, companyId: isSystem ? undefined : companyId ?? undefined }),
      // Projects list only matters when assigning per-project access — i.e.
      // company scope. System admins don't get per-project access.
      isSystem
        ? Promise.resolve<Project[]>([])
        : Projects.list(user?.role === 'super_admin' ? companyId ?? undefined : undefined),
    ])
      .then(([u, p]) => {
        setRows(u)
        setProjects(p)
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false))
  }
  useEffect(load, [user?.role, companyId, scope])

  // Role choices per scope. System scope: only super_admin. Company scope:
  // everything except super_admin.
  const availableRoles: UserRole[] = useMemo(
    () =>
      isSystem
        ? ['super_admin']
        : ['company_admin', 'company_user', 'end_customer'],
    [isSystem],
  )

  function openCreate() {
    setEditing(null)
    setForm({
      ...EMPTY_FORM,
      role: isSystem ? 'super_admin' : 'company_user',
    })
    setSaveErr(null)
    setOpen(true)
  }
  function openEdit(u: UserRow) {
    setEditing(u)
    setForm({
      full_name: u.full_name,
      email: u.email,
      phone: u.phone || '',
      role: u.role,
      has_all_projects: u.has_all_projects,
      project_ids: u.project_ids || [],
      is_active: u.is_active,
    })
    setSaveErr(null)
    setOpen(true)
  }

  async function save() {
    setSaveErr(null)
    const payload = {
      full_name: form.full_name,
      email: form.email,
      phone: form.phone || null,
      role: form.role,
      company_id: companyId ?? null,
      has_all_projects: form.role === 'company_user' ? form.has_all_projects : false,
      project_ids:
        form.role === 'company_user' && !form.has_all_projects ? form.project_ids : [],
      is_active: form.is_active,
    }
    try {
      if (editing) await Users.update(editing.id, payload as any)
      else await Users.create(payload as any)
      setOpen(false)
      load()
    } catch (e) {
      setSaveErr(String(e))
    }
  }

  async function remove(u: UserRow) {
    if (u.id === user?.id) {
      await alert({
        title: 'פעולה אסורה',
        message: 'לא ניתן להשבית את המשתמש שלך מתוך החשבון הנוכחי.',
        variant: 'danger',
      })
      return
    }
    const ok = await confirm({
      title: 'השבתת משתמש',
      message: `להשבית את "${u.full_name}"? הוא יסומן כלא פעיל ולא יוכל להתחבר.`,
      variant: 'danger',
      confirmLabel: 'השבת',
    })
    if (!ok) return
    await Users.remove(u.id)
    load()
  }

  function toggleProject(pid: number) {
    setForm((f) => ({
      ...f,
      project_ids: f.project_ids.includes(pid)
        ? f.project_ids.filter((x) => x !== pid)
        : [...f.project_ids, pid],
    }))
  }

  if (needsCompany) {
    return (
      <div className="tact-kpi" style={{ textAlign: 'center' }}>
        <div className="tact-kpi-label">בחר חברה כדי לנהל משתמשים</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ fontSize: '1.3rem', fontWeight: 700, color: 'var(--color-primary)' }}>
            {isSystem ? 'משתמשי מערכת' : 'משתמשי חברה'}
          </h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-light)' }}>
            {isSystem
              ? 'מנהלי-על שמנהלים את כל המערכת — ללא שיוך לחברה ספציפית'
              : 'משתמשים, הרשאות וגישת פרויקטים בתוך החברה'}
          </div>
        </div>
        <button onClick={openCreate} className="tact-btn tact-btn-primary">
          + {isSystem ? 'מנהל-על חדש' : 'משתמש חדש'}
        </button>
      </div>

      {error && <div style={{ color: 'var(--color-accent)', marginBottom: 10 }}>{error}</div>}
      {loading ? (
        <div style={{ color: 'var(--color-text-light)' }}>טוען…</div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(r) => r.id}
          columns={[
            { header: 'שם', key: 'full_name' },
            { header: 'אימייל', key: 'email' },
            { header: 'תפקיד', key: 'role', render: (r) => ROLE_LABEL[r.role] },
            {
              header: 'גישת פרויקטים',
              key: 'has_all_projects',
              render: (r) => {
                if (r.role !== 'company_user') return '—'
                if (r.has_all_projects) return <span className="tact-badge tact-badge-on">כל הפרויקטים</span>
                return <span className="tact-badge tact-badge-soon">{r.project_ids.length} פרויקטים</span>
              },
            },
            {
              header: 'סטטוס',
              key: 'is_active',
              render: (r) => (
                <span className={`tact-badge ${r.is_active ? 'tact-badge-pos' : 'tact-badge-soon'}`}>
                  {r.is_active ? 'פעיל' : 'לא פעיל'}
                </span>
              ),
            },
          ]}
          actions={(r) => (
            <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
              <button onClick={() => openEdit(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem' }}>
                ערוך
              </button>
              <button onClick={() => remove(r)} className="tact-btn tact-btn-ghost" style={{ padding: '6px 14px', fontSize: '0.8rem', color: 'var(--color-accent)' }}>
                השבת
              </button>
            </div>
          )}
          empty={isSystem ? 'אין עדיין מנהלי מערכת.' : 'אין עדיין משתמשים בחברה זו.'}
        />
      )}

      <Modal
        open={open}
        title={editing ? 'עריכת משתמש' : 'משתמש חדש'}
        width={600}
        onClose={() => setOpen(false)}
        footer={
          <>
            <button className="tact-btn tact-btn-ghost" onClick={() => setOpen(false)}>
              ביטול
            </button>
            <button className="tact-btn tact-btn-primary" onClick={save}>
              שמור
            </button>
          </>
        }
      >
        <Field label="שם מלא">
          <input style={inputStyle} value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <Field label="אימייל">
          <input style={inputStyle} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        </Field>
        <Field label="טלפון">
          <input style={inputStyle} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </Field>
        <Field label="תפקיד">
          <select
            style={inputStyle}
            value={form.role}
            onChange={(e) => setForm({ ...form, role: e.target.value as UserRole })}
          >
            {availableRoles.map((r) => (
              <option key={r} value={r}>
                {ROLE_LABEL[r]}
              </option>
            ))}
          </select>
        </Field>

        {form.role === 'company_user' && (
          <>
            <Field label="גישת פרויקטים">
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <input
                  type="radio"
                  name="proj"
                  checked={form.has_all_projects}
                  onChange={() => setForm({ ...form, has_all_projects: true })}
                />
                <span>כל הפרויקטים של החברה</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <input
                  type="radio"
                  name="proj"
                  checked={!form.has_all_projects}
                  onChange={() => setForm({ ...form, has_all_projects: false })}
                />
                <span>בחר פרויקטים ספציפיים</span>
              </label>
            </Field>
            {!form.has_all_projects && (
              <Field label="בחר פרויקטים">
                <div
                  style={{
                    maxHeight: 160,
                    overflowY: 'auto',
                    border: '1px solid var(--color-border)',
                    borderRadius: 8,
                    padding: 8,
                  }}
                >
                  {projects.length === 0 && (
                    <div style={{ color: 'var(--color-text-light)', fontSize: '0.85rem' }}>
                      אין פרויקטים זמינים
                    </div>
                  )}
                  {projects.map((p) => (
                    <label key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                      <input
                        type="checkbox"
                        checked={form.project_ids.includes(p.id)}
                        onChange={() => toggleProject(p.id)}
                      />
                      <span style={{ fontSize: '0.9rem' }}>{p.name}</span>
                    </label>
                  ))}
                </div>
              </Field>
            )}
          </>
        )}

        <Field label="סטטוס">
          <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              type="checkbox"
              checked={form.is_active}
              onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
            />
            <span style={{ fontSize: '0.9rem' }}>פעיל</span>
          </label>
        </Field>
        {saveErr && <div style={{ color: 'var(--color-accent)' }}>{saveErr}</div>}
      </Modal>
    </div>
  )
}

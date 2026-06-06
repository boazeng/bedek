const TOKEN_KEY = 'cmm-token'
const COMPANY_KEY = 'cmm-active-company-id'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(COMPANY_KEY)
}

/** For super_admin: which tenant to view. Ignored for other roles. */
export function getActiveCompanyId(): number | null {
  const v = localStorage.getItem(COMPANY_KEY)
  return v ? Number(v) : null
}
export function setActiveCompanyId(id: number | null) {
  if (id === null) localStorage.removeItem(COMPANY_KEY)
  else localStorage.setItem(COMPANY_KEY, String(id))
}

type ApiOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE'
  body?: unknown
  query?: Record<string, string | number | undefined>
  auth?: boolean
}

export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  const { method = 'GET', body, query, auth = true } = opts
  const url = new URL(path, window.location.origin)
  if (query) {
    for (const [k, v] of Object.entries(query)) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v))
    }
  }
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  if (auth) {
    const t = getToken()
    if (t) headers['Authorization'] = `Bearer ${t}`
  }
  const res = await fetch(url.toString().replace(window.location.origin, ''), {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  if (res.status === 204) return undefined as T
  if (!res.ok) {
    let detail: string
    try {
      const j = await res.json()
      detail = j.detail ? (typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)) : res.statusText
    } catch {
      detail = res.statusText
    }
    throw new ApiError(res.status, detail)
  }
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ---------- Types ----------
export type UserRole = 'super_admin' | 'company_admin' | 'company_user' | 'end_customer'

export type CurrentUser = {
  id: number
  email: string
  full_name: string
  role: UserRole
  company_id: number | null
  company_name: string | null
  has_all_projects: boolean
}

export type DevUserOption = {
  id: number
  email: string
  full_name: string
  role: UserRole
  company_name: string | null
}

export type Company = {
  id: number
  name: string
  slug: string
  contact_email: string | null
  phone: string | null
  is_active: boolean
  created_at: string
}

export type Project = {
  id: number
  company_id: number
  name: string
  address: string | null
  project_manager: string | null
  site_manager: string | null
  created_at: string
}

export type SaleUnit = {
  id: number
  company_id: number
  project_id: number
  unit_type: string
  unit_number: string
  entrance: string | null
  floor: string | null
  buyer_id: number | null
  created_at: string
}

export type LocationRow = {
  id: number
  company_id: number
  name: string
  applies_to_public_only: boolean
  sort_order: number
}

export type EntityKind = 'building' | 'floor' | 'unit' | 'location'

export type EntityTypeRow = {
  id: number
  name: string
  code: string | null
  /** What ProjectItem kind a template of this entity creates. */
  kind: EntityKind
  sort_order: number
  is_active: boolean
}

export type TemplateItemKind = 'location' | 'template'
/** Legacy — kept for backward-compat with stored values. Behavior now driven
 *  by the entity_type's kind. New templates send 'simple' and ignore the
 *  format-specific UI columns. */
export type TemplateFormat = 'simple' | 'floor' | 'residential_building'

export type TemplateItem = {
  id?: number
  item_kind: TemplateItemKind
  location_name: string | null
  child_template_id: number | null
  child_template_name?: string | null
  quantity: number
  sort_order?: number
  label: string | null
  /** Legacy field — used by old residential_building templates. Optional now. */
  floor?: string | null
}

export type TemplateListRow = {
  id: number
  name: string
  code: string | null
  format: TemplateFormat
  sort_order: number
  entity_type_id: number | null
  entity_type_name: string | null
  /** null = system-wide template. Set = scoped to that company. */
  company_id: number | null
  company_name: string | null
  description: string | null
  is_active: boolean
  item_count: number
}

export type TemplateDetail = {
  id: number
  name: string
  code: string | null
  format: TemplateFormat
  sort_order: number
  entity_type_id: number | null
  entity_type_name: string | null
  /** null = system-wide. Set = scoped to that company. */
  company_id: number | null
  description: string | null
  is_active: boolean
  items: TemplateItem[]
}

export type ProjectItemKind = 'building' | 'floor' | 'unit' | 'location'

export type ProjectItemNode = {
  id: number
  project_id: number
  parent_id: number | null
  kind: ProjectItemKind
  name: string
  number: string | null         // full hierarchical code (P00001-B01-F02-U01-01)
  short_code: string | null     // just this level's segment (F02 / U01 / 01)
  direction: string | null
  entity_type_id: number | null
  entity_type_name: string | null
  template_id: number | null
  template_name: string | null
  sort_order: number
  /** Inline-editable apartment numbers (only meaningful on kind=unit rows). */
  temp_apt_number: string | null
  permanent_apt_number: string | null
  /** Free-text customer label — shown next to the row name. */
  customer_name: string | null
  /** Name of the ancestor floor — null for buildings and floors themselves. */
  floor_name: string | null
  children: ProjectItemNode[]
}

export type ProjectItemCreate = {
  kind: ProjectItemKind
  name: string
  number?: string | null
  direction?: string | null
  entity_type_id?: number | null
  template_id?: number | null
  parent_id?: number | null
}

export type ProjectItemUpdate = {
  name?: string
  number?: string | null
  direction?: string | null
  floor?: string | null
  temp_apt_number?: string | null
  permanent_apt_number?: string | null
  customer_name?: string | null
}

// ---------- Malfunctions / defects ----------
export type MalfunctionBuildingSummary = {
  id: number
  name: string
  number: string | null
  open_defects: number
}

export type UnitWithDefects = {
  id: number
  short_code: string | null
  number: string | null
  name: string
  direction: string | null
  open_defects: number
  customer_name: string | null
  floor_name: string | null
  floor_number: string | null
}

export type MalfunctionActivity = {
  id: number
  occurred_on: string
  action: string
  notes: string | null
  performed_by: string | null
  created_at: string
}

export type MalfunctionListRow = {
  id: number
  project_item_id: number | null
  project_item_name: string | null
  status: string
  source: string
  group: string
  description: string
  professional: string | null
  opened_at: string
  closed_at: string | null
}

export type MalfunctionDetail = {
  id: number
  project_id: number
  project_item_id: number | null
  project_item_name: string | null
  project_item_number: string | null
  status: string
  source: string
  group: string
  description: string
  professional: string | null
  assigned_to: string | null
  opened_at: string
  closed_at: string | null
  created_at: string
  updated_at: string
  activities: MalfunctionActivity[]
}

export type TemplateWrite = {
  name: string
  code: string | null
  format: TemplateFormat
  entity_type_id: number | null
  /** null = system-wide template. Set = scoped to that company. */
  company_id?: number | null
  description: string | null
  is_active: boolean
  items: TemplateItem[]
}

export type UserRow = {
  id: number
  full_name: string
  email: string
  phone: string | null
  role: UserRole
  company_id: number | null
  has_all_projects: boolean
  buyer_id: number | null
  is_active: boolean
  created_at: string
  project_ids: number[]
}

export type StatusBreakdown = {
  pending_manager: number
  todo: number
  negotiation: number
  frozen: number
  done: number
  cancelled: number
}
export type SourceBreakdown = {
  whatsapp: number
  manual: number
  bedek_report: number
  inspector_tour: number
  delivery_protocol: number
  email: number
}
export type ProjectKpi = {
  project_id: number
  project_name: string
  address: string | null
  total: number
  open_count: number
  pending_manager: number
  todo: number
  negotiation: number
  done: number
  avg_days_open: number | null
  by_status: StatusBreakdown
  by_source: SourceBreakdown
}
export type CompanyKpi = {
  company_id: number
  company_name: string
  total_projects: number
  total_units: number
  total_defects: number
  open_defects: number
  pending_manager: number
  done_defects: number
  by_status: StatusBreakdown
  by_source: SourceBreakdown
}
export type DashboardResponse = { company: CompanyKpi; projects: ProjectKpi[] }

// ---------- Endpoints ----------
export const Auth = {
  devUsers: () => api<DevUserOption[]>('/api/auth/dev-users', { auth: false }),
  devLogin: (email: string) =>
    api<{ access_token: string; user: CurrentUser }>('/api/auth/dev-login', {
      method: 'POST',
      body: { email },
      auth: false,
    }),
  me: () => api<CurrentUser>('/api/auth/me'),
}

export const Dashboard = {
  fetch: (companyId?: number) =>
    api<DashboardResponse>('/api/dashboard', { query: { company_id: companyId } }),
}

export const Companies = {
  list: () => api<Company[]>('/api/admin/companies'),
  create: (body: Omit<Company, 'id' | 'created_at'>) =>
    api<Company>('/api/admin/companies', { method: 'POST', body }),
  update: (id: number, body: Omit<Company, 'id' | 'created_at'>) =>
    api<Company>(`/api/admin/companies/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/admin/companies/${id}`, { method: 'DELETE' }),
}

export type UserScope = 'system' | 'company'

export const Users = {
  /** scope=system: super_admins. scope=company: users tied to that company.
   *  No scope = legacy (super sees all, others see own). */
  list: (opts: { scope?: UserScope; companyId?: number } = {}) =>
    api<UserRow[]>('/api/admin/users', {
      query: { scope: opts.scope, company_id: opts.companyId },
    }),
  create: (body: Partial<UserRow>) =>
    api<UserRow>('/api/admin/users', { method: 'POST', body }),
  update: (id: number, body: Partial<UserRow>) =>
    api<UserRow>(`/api/admin/users/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/admin/users/${id}`, { method: 'DELETE' }),
}

export const Projects = {
  list: (companyId?: number) =>
    api<Project[]>('/api/projects', { query: { company_id: companyId } }),
  get: (id: number) => api<Project>(`/api/projects/${id}`),
  create: (body: Partial<Project>) =>
    api<Project>('/api/projects', { method: 'POST', body }),
  update: (id: number, body: Partial<Project>) =>
    api<Project>(`/api/projects/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/projects/${id}`, { method: 'DELETE' }),
}

export const ProjectTree = {
  list: (projectId: number) =>
    api<ProjectItemNode[]>(`/api/projects/${projectId}/tree`),
  create: (projectId: number, body: ProjectItemCreate) =>
    api<ProjectItemNode>(`/api/projects/${projectId}/tree/items`, {
      method: 'POST',
      body,
    }),
  update: (projectId: number, itemId: number, body: ProjectItemUpdate) =>
    api<ProjectItemNode>(`/api/projects/${projectId}/tree/items/${itemId}`, {
      method: 'PUT',
      body,
    }),
  remove: (projectId: number, itemId: number) =>
    api<void>(`/api/projects/${projectId}/tree/items/${itemId}`, {
      method: 'DELETE',
    }),
  duplicate: (projectId: number, itemId: number) =>
    api<{ new_id: number; tree: ProjectItemNode[] }>(
      `/api/projects/${projectId}/tree/items/${itemId}/duplicate`,
      { method: 'POST' },
    ),
  reorder: (projectId: number, parentId: number | null, ids: number[]) =>
    api<void>(`/api/projects/${projectId}/tree/reorder`, {
      method: 'POST',
      body: { parent_id: parentId, ids },
    }),
  saveAsTemplate: (
    projectId: number,
    itemId: number,
    body: { name: string; code?: string | null; description?: string | null },
  ) =>
    api<TemplateDetail>(
      `/api/projects/${projectId}/tree/items/${itemId}/save-as-template`,
      { method: 'POST', body },
    ),
  applyTemplate: (projectId: number, templateId: number, parentId: number | null) =>
    api<ProjectItemNode[]>(`/api/projects/${projectId}/tree/apply-template`, {
      method: 'POST',
      body: { template_id: templateId, parent_id: parentId },
    }),
}

export const SaleUnits = {
  list: (projectId: number) =>
    api<SaleUnit[]>('/api/sale-units', { query: { project_id: projectId } }),
  create: (body: Partial<SaleUnit>) =>
    api<SaleUnit>('/api/sale-units', { method: 'POST', body }),
  update: (id: number, body: Partial<SaleUnit>) =>
    api<SaleUnit>(`/api/sale-units/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/sale-units/${id}`, { method: 'DELETE' }),
}

export type TemplateScope = 'system' | 'company'

export const Templates = {
  /** scope filters strictly: 'system' = templates with no company; 'company' = a
   *  specific company's templates. No scope = legacy combined view (system + own/specified).
   *  companyId is required when super_admin requests scope='company'. */
  list: (opts: { scope?: TemplateScope; companyId?: number } = {}) =>
    api<TemplateListRow[]>('/api/system/templates', {
      query: { scope: opts.scope, company_id: opts.companyId },
    }),
  get: (id: number) => api<TemplateDetail>(`/api/system/templates/${id}`),
  create: (body: TemplateWrite) =>
    api<TemplateDetail>('/api/system/templates', { method: 'POST', body }),
  update: (id: number, body: TemplateWrite) =>
    api<TemplateDetail>(`/api/system/templates/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/system/templates/${id}`, { method: 'DELETE' }),
  duplicate: (id: number) =>
    api<TemplateDetail>(`/api/system/templates/${id}/duplicate`, { method: 'POST' }),
  reorder: (ids: number[]) =>
    api<void>('/api/system/templates/reorder', {
      method: 'POST',
      body: { ids },
    }),
}

export const EntityTypes = {
  list: () => api<EntityTypeRow[]>('/api/system/entity-types'),
  create: (body: Partial<EntityTypeRow>) =>
    api<EntityTypeRow>('/api/system/entity-types', { method: 'POST', body }),
  update: (id: number, body: Partial<EntityTypeRow>) =>
    api<EntityTypeRow>(`/api/system/entity-types/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/system/entity-types/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) =>
    api<void>('/api/system/entity-types/reorder', {
      method: 'POST',
      body: { ids },
    }),
}

export type MalfunctionCreatePayload = {
  project_id: number
  project_item_id: number | null
  description: string
  status?: string
  source?: string
  group?: string
  professional?: string | null
  opened_at?: string | null
  buyer_id?: number | null
}

export type MalfunctionUpdatePayload = {
  description?: string
  professional?: string | null
  status?: string
  group?: string
  closed_at?: string | null
}

export type MalfunctionActivityCreatePayload = {
  occurred_on?: string | null
  action: string
  notes?: string | null
  performed_by?: string | null
}

export const Malfunctions = {
  buildings: (projectId: number) =>
    api<MalfunctionBuildingSummary[]>('/api/malfunctions/buildings', {
      query: { project_id: projectId },
    }),
  unitsWithDefects: (projectId: number, buildingId?: number | null) =>
    api<UnitWithDefects[]>('/api/malfunctions/units', {
      query: { project_id: projectId, building_id: buildingId ?? undefined },
    }),
  byUnit: (projectId: number, unitId: number) =>
    api<MalfunctionListRow[]>('/api/malfunctions/by-unit', {
      query: { project_id: projectId, unit_id: unitId },
    }),
  get: (defectId: number) =>
    api<MalfunctionDetail>(`/api/malfunctions/${defectId}`),
  create: (body: MalfunctionCreatePayload) =>
    api<MalfunctionDetail>('/api/malfunctions', { method: 'POST', body }),
  update: (defectId: number, body: MalfunctionUpdatePayload) =>
    api<MalfunctionDetail>(`/api/malfunctions/${defectId}`, { method: 'PUT', body }),
  addActivity: (defectId: number, body: MalfunctionActivityCreatePayload) =>
    api<MalfunctionActivity>(`/api/malfunctions/${defectId}/activities`, {
      method: 'POST',
      body,
    }),
}

export type SystemLocationRow = {
  id: number
  name: string
  code: string | null
  sort_order: number
  is_active: boolean
  created_at: string
}

export type SystemLocationImportSummary = {
  created: number
  updated: number
  deleted: number
  errors: string[]
}

export const SystemLocations = {
  /** Names-only, used by the template editor's picker. */
  list: () => api<string[]>('/api/system/locations'),
  /** Full rows for the management page. */
  detail: () => api<SystemLocationRow[]>('/api/system/locations/detail'),
  create: (body: { name: string; code?: string | null; is_active?: boolean }) =>
    api<SystemLocationRow>('/api/system/locations', { method: 'POST', body }),
  update: (id: number, body: { name: string; code?: string | null; is_active: boolean }) =>
    api<SystemLocationRow>(`/api/system/locations/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/system/locations/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) =>
    api<void>('/api/system/locations/reorder', { method: 'POST', body: { ids } }),
  /** Returns the absolute URL of the export endpoint — opens in a new tab to
   *  trigger the browser's download dialog (with auth header it's not possible
   *  via a plain <a>, so we use a fetch + Blob in the page). */
  exportUrl: () => '/api/system/locations/export.xlsx',
  importXlsx: async (file: File): Promise<SystemLocationImportSummary> => {
    const form = new FormData()
    form.append('file', file)
    const t = getToken()
    const res = await fetch('/api/system/locations/import.xlsx', {
      method: 'POST',
      body: form,
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
    if (!res.ok) {
      let detail = res.statusText
      try {
        const j = await res.json()
        if (j?.detail) detail = typeof j.detail === 'string' ? j.detail : JSON.stringify(j.detail)
      } catch {}
      throw new ApiError(res.status, detail)
    }
    return res.json()
  },
  downloadXlsx: async (): Promise<void> => {
    const t = getToken()
    const res = await fetch('/api/system/locations/export.xlsx', {
      headers: t ? { Authorization: `Bearer ${t}` } : {},
    })
    if (!res.ok) throw new ApiError(res.status, res.statusText)
    const blob = await res.blob()
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'system_locations.xlsx'
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  },
}

export const Locations = {
  list: (companyId?: number) =>
    api<LocationRow[]>('/api/locations', { query: { company_id: companyId } }),
  create: (body: Partial<LocationRow>, companyId?: number) =>
    api<LocationRow>('/api/locations', {
      method: 'POST',
      body,
      query: { company_id: companyId },
    }),
  update: (id: number, body: Partial<LocationRow>) =>
    api<LocationRow>(`/api/locations/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/locations/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[], companyId?: number) =>
    api<void>('/api/locations/reorder', {
      method: 'POST',
      body: { ids },
      query: { company_id: companyId },
    }),
  /** Replace the company catalog with the active system_locations list.
   *  Full-replacement: existing rows are deleted first. */
  importFromSystem: (companyId?: number) =>
    api<{ added: number; deleted: number }>(
      '/api/locations/import-system',
      { method: 'POST', query: { company_id: companyId } },
    ),
}

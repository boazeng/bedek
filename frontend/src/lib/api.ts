const TOKEN_KEY = 'cmm-token'
const COMPANY_KEY = 'cmm-active-company-id'
const PROJECT_KEY = 'cmm-active-project'
const UNIT_KEY = 'cmm-work-scope'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}
export function setToken(t: string) {
  localStorage.setItem(TOKEN_KEY, t)
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
  localStorage.removeItem(COMPANY_KEY)
  localStorage.removeItem(PROJECT_KEY)
  localStorage.removeItem(UNIT_KEY)
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

/** The project the user is currently working on. Persisted (id + name) so the
 *  top-bar badge can show the name without re-fetching. Null = none selected. */
export type ActiveProject = { id: number; name: string }
export function getActiveProject(): ActiveProject | null {
  const v = localStorage.getItem(PROJECT_KEY)
  if (!v) return null
  try {
    const p = JSON.parse(v)
    return typeof p?.id === 'number' ? { id: p.id, name: String(p.name ?? '') } : null
  } catch {
    return null
  }
}
export function setActiveProject(p: ActiveProject | null) {
  if (p === null) localStorage.removeItem(PROJECT_KEY)
  else localStorage.setItem(PROJECT_KEY, JSON.stringify(p))
}

/** The building → entrance → unit the user is currently working on. Each level
 *  is null until chosen. Persisted so it survives reloads. */
export type WorkScope = {
  buildingId: number | null
  buildingName: string | null
  entranceId: number | null
  entranceName: string | null
  unitId: number | null
  unitName: string | null
}
export const EMPTY_WORK_SCOPE: WorkScope = {
  buildingId: null,
  buildingName: null,
  entranceId: null,
  entranceName: null,
  unitId: null,
  unitName: null,
}
export function getWorkScope(): WorkScope {
  const v = localStorage.getItem(UNIT_KEY)
  if (!v) return EMPTY_WORK_SCOPE
  try {
    return { ...EMPTY_WORK_SCOPE, ...JSON.parse(v) }
  } catch {
    return EMPTY_WORK_SCOPE
  }
}
export function setWorkScope(s: WorkScope) {
  localStorage.setItem(UNIT_KEY, JSON.stringify(s))
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
  /** Linked tenant id in TACT-CRM (one-time mapping). */
  crm_company_id?: number | null
  created_at: string
}

export type Project = {
  id: number
  company_id: number
  name: string
  address: string | null
  project_manager: string | null
  site_manager: string | null
  /** Set when the project header was imported from TACT-CRM. */
  crm_external_id?: string | null
  created_at: string
}

export type CrmStatus = {
  configured: boolean
  crm_company_id: number | null
  crm_company_name: string | null
  /** 5-digit CRM company number (Priority-style). Additive; may be null. */
  crm_company_number: number | null
  error: string | null
}

export type LocationRow = {
  id: number
  company_id: number
  name: string
  applies_to_public_only: boolean
  sort_order: number
}

/** A professional trade classification (אלומיניום, אינסטלציה, …). */
export type ProfessionalRow = {
  id: number
  name: string
  sort_order: number
  is_active: boolean
}

/** Per-company professional trade classification. */
export type CompanyProfessionalRow = {
  id: number
  company_id: number
  name: string
  sort_order: number
  is_active: boolean
}

/** A buyer / customer (לקוח / רוכש) — scoped to a company and (optionally) a project. */
export type Buyer = {
  id: number
  company_id: number
  project_id: number | null
  name: string
  nickname: string | null
  phone: string | null
}

/** A customer as it lives in TACT-CRM (the system of record). Referenced by
 *  `membership_id` (company-scoped stable id). */
export type CrmCustomer = {
  membership_id: number
  customer_number: string | null
  full_name: string
  nickname: string | null
  phone: string | null
}

export type ProjectItemKind = 'building' | 'entrance' | 'floor' | 'unit'

/** Sale-unit type (only meaningful on kind='unit' rows). */
export type SaleUnitType = 'apartment' | 'parking' | 'storage' | 'shop' | 'public_area'

export type ProjectItemNode = {
  id: number
  project_id: number
  parent_id: number | null
  kind: ProjectItemKind
  name: string
  number: string | null         // full hierarchical code (P00001-B01-E01-F02)
  short_code: string | null     // just this level's segment (E01 / F02 / unit number)
  unit_type: SaleUnitType | null  // sale-unit type (kind='unit' only)
  direction: string | null
  sort_order: number
  /** Inline-editable apartment numbers (only meaningful on kind=unit rows). */
  temp_apt_number: string | null
  permanent_apt_number: string | null
  /** Free-text customer label — shown next to the row name. */
  customer_name: string | null
  /** Linked buyer (legacy local link — unused by the CRM-customer flow). */
  buyer_id: number | null
  buyer_name: string | null
  /** CRM customer membership ids linked to this unit (many-to-many). */
  customer_membership_ids: number[]
  /** Name of the ancestor floor — null for buildings and floors themselves. */
  floor_name: string | null
  children: ProjectItemNode[]
}

export type ProjectItemCreate = {
  kind: ProjectItemKind
  name: string
  number?: string | null
  unit_type?: string | null
  direction?: string | null
  parent_id?: number | null
}

export type ProjectItemUpdate = {
  name?: string
  number?: string | null
  unit_type?: string | null
  direction?: string | null
  floor?: string | null
  temp_apt_number?: string | null
  permanent_apt_number?: string | null
  customer_name?: string | null
  buyer_id?: number | null
}

export type BulkAddUnitsPayload = {
  unit_type: string
  count?: number
  start_number?: number | null
  number?: string | null
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
  seq: number
  number: string | null   // composed {malfunction number}.{seq}
  occurred_on: string
  action: string
  notes: string | null
  performed_by: string | null
  created_at: string
}

export type MalfunctionListRow = {
  id: number
  number: string | null
  project_item_id: number | null
  project_item_name: string | null
  location_id: number | null
  location_name: string | null
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
  number: string | null
  project_id: number
  project_item_id: number | null
  project_item_name: string | null
  project_item_number: string | null
  location_id: number | null
  location_name: string | null
  status: string
  source: string
  group: string
  description: string
  professional: string | null
  assigned_to: string | null
  opened_at: string
  closed_at: string | null
  customer_signed: boolean
  customer_signature: string | null
  customer_signed_at: string | null
  created_at: string
  updated_at: string
  activities: MalfunctionActivity[]
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
  login: (email: string, password: string) =>
    api<{ access_token: string; user: CurrentUser }>('/api/auth/login', {
      method: 'POST',
      body: { email, password },
      auth: false,
    }),
  google: (credential: string) =>
    api<{ access_token: string; user: CurrentUser }>('/api/auth/google', {
      method: 'POST',
      body: { credential },
      auth: false,
    }),
  changePassword: (current_password: string, new_password: string) =>
    api<{ ok: boolean }>('/api/auth/change-password', {
      method: 'POST',
      body: { current_password, new_password },
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

export const Crm = {
  /** CRM companies for the import picker (each flagged if already linked). super_admin. */
  companies: () =>
    api<{ id: number; name: string; company_number: number | null; linked: boolean }[]>(
      '/api/crm/companies',
    ),
  /** Create/link the chosen CRM companies + auto-import their projects. super_admin. */
  importCompanies: (ids: number[]) =>
    api<{
      created: number
      updated: number
      skipped: number
      projects_created: number
      projects_updated: number
    }>('/api/crm/import-companies', { method: 'POST', body: { ids } }),
  /** Sync projects for every CRM-linked company. super_admin. */
  syncAllProjects: () =>
    api<{ companies: number; projects_created: number; projects_updated: number }>(
      '/api/crm/sync-all-projects',
      { method: 'POST' },
    ),
  /** Integration status + a whoami check against the linked CRM tenant. */
  status: (companyId?: number) =>
    api<CrmStatus>('/api/crm/status', { query: { company_id: companyId } }),
  /** Import/update this company's real-estate (bedek) projects from CRM. */
  syncProjects: (companyId?: number) =>
    api<{ created: number; updated: number; total: number }>(
      '/api/crm/sync-projects',
      { method: 'POST', query: { company_id: companyId } },
    ),
  /** The company's customers from CRM (system of record). */
  customers: (opts: { companyId?: number; search?: string } = {}) =>
    api<CrmCustomer[]>('/api/crm/customers', {
      query: { company_id: opts.companyId, search: opts.search },
    }),
  createCustomer: (body: CrmCustomerInput, companyId?: number) =>
    api<CrmCustomer>('/api/crm/customers', {
      method: 'POST',
      body,
      query: { company_id: companyId },
    }),
  updateCustomer: (membershipId: number, body: CrmCustomerInput, companyId?: number) =>
    api<CrmCustomer>(`/api/crm/customers/${membershipId}`, {
      method: 'PUT',
      body,
      query: { company_id: companyId },
    }),
}

export type CrmCustomerInput = {
  full_name: string
  nickname?: string | null
  phone?: string | null
  customer_number?: string | null
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
  /** Bulk-add sale units to a floor (apartments auto-number per entrance). */
  bulkAddUnits: (projectId: number, floorId: number, body: BulkAddUnitsPayload) =>
    api<ProjectItemNode[]>(
      `/api/projects/${projectId}/tree/floors/${floorId}/units`,
      { method: 'POST', body },
    ),
  /** Re-sequence apartment numbers 1..N within each entrance. */
  renumber: (projectId: number) =>
    api<{ renumbered: number }>(`/api/projects/${projectId}/tree/renumber`, {
      method: 'POST',
    }),
  /** Replace the CRM customers linked to a unit (many-to-many). */
  setUnitCustomers: (projectId: number, unitId: number, membershipIds: number[]) =>
    api<ProjectItemNode>(`/api/projects/${projectId}/tree/items/${unitId}/customers`, {
      method: 'PUT',
      body: { membership_ids: membershipIds },
    }),
}

export type BuyerInput = {
  name: string
  nickname?: string | null
  phone?: string | null
  project_id?: number | null
}

export const Buyers = {
  list: (opts: { companyId?: number; projectId?: number } = {}) =>
    api<Buyer[]>('/api/buyers', {
      query: { company_id: opts.companyId, project_id: opts.projectId },
    }),
  create: (body: BuyerInput, companyId?: number) =>
    api<Buyer>('/api/buyers', { method: 'POST', body, query: { company_id: companyId } }),
  update: (id: number, body: BuyerInput) =>
    api<Buyer>(`/api/buyers/${id}`, { method: 'PUT', body }),
  remove: (id: number) => api<void>(`/api/buyers/${id}`, { method: 'DELETE' }),
}

/** System-wide catalog of location names (סלון, מטבח…). */
export type SystemLocationRow = {
  id: number
  name: string
  sort_order: number
  is_active: boolean
}

export const SystemLocations = {
  list: () => api<SystemLocationRow[]>('/api/system/locations'),
  create: (body: Partial<SystemLocationRow>) =>
    api<SystemLocationRow>('/api/system/locations', { method: 'POST', body }),
  update: (id: number, body: Partial<SystemLocationRow>) =>
    api<SystemLocationRow>(`/api/system/locations/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/system/locations/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) =>
    api<void>('/api/system/locations/reorder', { method: 'POST', body: { ids } }),
}

export const Professionals = {
  list: () => api<ProfessionalRow[]>('/api/system/professionals'),
  create: (body: Partial<ProfessionalRow>) =>
    api<ProfessionalRow>('/api/system/professionals', { method: 'POST', body }),
  update: (id: number, body: Partial<ProfessionalRow>) =>
    api<ProfessionalRow>(`/api/system/professionals/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/system/professionals/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[]) =>
    api<void>('/api/system/professionals/reorder', {
      method: 'POST',
      body: { ids },
    }),
}

export const CompanyProfessionals = {
  list: (companyId?: number) =>
    api<CompanyProfessionalRow[]>('/api/professionals', {
      query: { company_id: companyId },
    }),
  create: (body: Partial<CompanyProfessionalRow>, companyId?: number) =>
    api<CompanyProfessionalRow>('/api/professionals', {
      method: 'POST',
      body,
      query: { company_id: companyId },
    }),
  update: (id: number, body: Partial<CompanyProfessionalRow>) =>
    api<CompanyProfessionalRow>(`/api/professionals/${id}`, { method: 'PUT', body }),
  remove: (id: number) =>
    api<void>(`/api/professionals/${id}`, { method: 'DELETE' }),
  reorder: (ids: number[], companyId?: number) =>
    api<void>('/api/professionals/reorder', {
      method: 'POST',
      body: { ids },
      query: { company_id: companyId },
    }),
  /** Reset the company catalog to the system-wide default classifications.
   *  Full-replacement: existing rows are deleted first. */
  importFromSystem: (companyId?: number) =>
    api<{ added: number; deleted: number }>('/api/professionals/import-system', {
      method: 'POST',
      query: { company_id: companyId },
    }),
}

export type MalfunctionCreatePayload = {
  project_id: number
  project_item_id: number | null
  location_id?: number | null
  description: string
  status?: string
  source?: string
  group?: string
  professional?: string | null
  opened_at?: string | null
  buyer_id?: number | null
  customer_signed?: boolean
  customer_signature?: string | null
  customer_signed_at?: string | null
}

export type MalfunctionUpdatePayload = {
  description?: string
  professional?: string | null
  status?: string
  group?: string
  closed_at?: string | null
  customer_signed?: boolean
  customer_signature?: string | null
  customer_signed_at?: string | null
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
  byUnit: (projectId: number, unitId: number, allStatuses = false) =>
    api<MalfunctionListRow[]>('/api/malfunctions/by-unit', {
      query: { project_id: projectId, unit_id: unitId, all: allStatuses ? 'true' : undefined },
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

// ---------- Reports ----------
export type ReportActivity = {
  number: string | null
  occurred_on: string
  action: string
  notes: string | null
  performed_by: string | null
}

export type ReportRow = {
  id: number
  number: string | null
  short_number: string | null
  building_id: number | null
  building_name: string | null
  entrance_id: number | null
  entrance_name: string | null
  unit_id: number | null
  unit_name: string | null
  floor_name: string | null
  location_name: string | null
  professional: string | null
  status: string
  status_label: string
  source: string
  source_label: string
  group: string
  group_label: string
  description: string
  opened_at: string
  closed_at: string | null
  activities: ReportActivity[]
}

export type ReportAppliedFilter = { label: string; value: string }

export type ReportResponse = {
  project_id: number
  project_name: string
  project_address: string | null
  filters: ReportAppliedFilter[]
  total: number
  rows: ReportRow[]
}

export type ReportFilterParams = {
  projectId: number
  buildingId?: number | null
  entranceId?: number | null
  unitId?: number | null
  professional?: string | null
  status?: string | null
  source?: string | null
}

export const Reports = {
  malfunctions: (f: ReportFilterParams) =>
    api<ReportResponse>('/api/reports/malfunctions', {
      query: {
        project_id: f.projectId,
        building_id: f.buildingId ?? undefined,
        entrance_id: f.entranceId ?? undefined,
        unit_id: f.unitId ?? undefined,
        professional: f.professional ?? undefined,
        status: f.status ?? undefined,
        source: f.source ?? undefined,
      },
    }),
}

// ---------- Attachments (files on a malfunction or a project item) ----------
export type Attachment = {
  id: number
  malfunction_id: number | null
  project_item_id: number | null
  original_filename: string | null
  content_type: string | null
  size_bytes: number | null
  uploaded_at: string
  download_url: string | null
}

export type AttachmentTarget = { malfunctionId?: number; projectItemId?: number }

type PresignResponse = {
  storage_key: string
  upload_url: string
  method: string
  content_type: string | null
}

export const Attachments = {
  list: (t: AttachmentTarget) =>
    api<Attachment[]>('/api/attachments', {
      query: { malfunction_id: t.malfunctionId, project_item_id: t.projectItemId },
    }),
  remove: (id: number) => api<void>(`/api/attachments/${id}`, { method: 'DELETE' }),

  /** Full presigned upload: presign → PUT bytes to storage → record the row. */
  async upload(file: File, t: AttachmentTarget): Promise<Attachment> {
    const target = {
      malfunction_id: t.malfunctionId ?? null,
      project_item_id: t.projectItemId ?? null,
    }
    const presign = await api<PresignResponse>('/api/attachments/presign', {
      method: 'POST',
      body: { ...target, filename: file.name, content_type: file.type || 'application/octet-stream' },
    })
    const res = await fetch(presign.upload_url, {
      method: 'PUT',
      headers: { 'Content-Type': presign.content_type || file.type || 'application/octet-stream' },
      body: file,
    })
    if (!res.ok) throw new ApiError(res.status, `העלאת הקובץ נכשלה (${res.status})`)
    return api<Attachment>('/api/attachments', {
      method: 'POST',
      body: {
        ...target,
        storage_key: presign.storage_key,
        original_filename: file.name,
        content_type: file.type || null,
        size_bytes: file.size,
      },
    })
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
  /** Reset the company catalog to the system-wide default locations (full replace). */
  importFromSystem: (companyId?: number) =>
    api<{ added: number; deleted: number }>('/api/locations/import-system', {
      method: 'POST',
      query: { company_id: companyId },
    }),
}

from pydantic import BaseModel


class StatusBreakdown(BaseModel):
    pending_manager: int = 0
    todo: int = 0
    negotiation: int = 0
    frozen: int = 0
    done: int = 0
    cancelled: int = 0


class SourceBreakdown(BaseModel):
    whatsapp: int = 0
    manual: int = 0
    bedek_report: int = 0
    inspector_tour: int = 0
    delivery_protocol: int = 0
    email: int = 0


class ProjectKpi(BaseModel):
    project_id: int
    project_name: str
    address: str | None = None
    total: int
    open_count: int          # not done/cancelled
    pending_manager: int
    todo: int
    negotiation: int
    done: int
    avg_days_open: float | None = None  # avg open age for non-closed defects
    by_status: StatusBreakdown
    by_source: SourceBreakdown


class CompanyKpi(BaseModel):
    company_id: int
    company_name: str
    total_projects: int
    total_units: int
    total_defects: int
    open_defects: int
    pending_manager: int
    done_defects: int
    by_status: StatusBreakdown
    by_source: SourceBreakdown


class DashboardResponse(BaseModel):
    company: CompanyKpi
    projects: list[ProjectKpi]

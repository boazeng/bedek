from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, case
from sqlalchemy.orm import Session

from ..deps import (
    allowed_project_ids_for,
    get_current_user,
    get_db,
)
from ..models import (
    Company,
    Project,
    SaleUnit,
    Malfunction,
    MalfunctionStatus,
    MalfunctionSource,
    User,
    UserRole,
)
from ..schemas.dashboard import (
    DashboardResponse,
    CompanyKpi,
    ProjectKpi,
    StatusBreakdown,
    SourceBreakdown,
)


router = APIRouter(prefix="/api/dashboard", tags=["dashboard"])


OPEN_STATUSES = (
    MalfunctionStatus.PENDING_MANAGER,
    MalfunctionStatus.TODO,
    MalfunctionStatus.NEGOTIATION,
    MalfunctionStatus.FROZEN,
)


def _status_breakdown_from_row(row) -> StatusBreakdown:
    return StatusBreakdown(
        pending_manager=row.pending_manager or 0,
        todo=row.todo or 0,
        negotiation=row.negotiation or 0,
        frozen=row.frozen or 0,
        done=row.done or 0,
        cancelled=row.cancelled or 0,
    )


def _source_breakdown_from_row(row) -> SourceBreakdown:
    return SourceBreakdown(
        whatsapp=row.src_whatsapp or 0,
        manual=row.src_manual or 0,
        bedek_report=row.src_bedek or 0,
        inspector_tour=row.src_inspector or 0,
        delivery_protocol=row.src_protocol or 0,
        email=row.src_email or 0,
    )


def _status_count(status_value: str):
    return func.sum(case((Malfunction.status == status_value, 1), else_=0))


def _source_count(source_value: str):
    return func.sum(case((Malfunction.source == source_value, 1), else_=0))


def _resolve_company(
    user: User, db: Session, company_id_param: int | None
) -> Company:
    """Pick the company the request operates on, respecting the user's role."""
    if user.role == UserRole.SUPER_ADMIN:
        if not company_id_param:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super admin must pass ?company_id=…",
            )
        target_id = company_id_param
    else:
        if user.company_id is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="User has no company assigned",
            )
        if company_id_param and company_id_param != user.company_id:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Cannot view another company",
            )
        target_id = user.company_id

    company = db.query(Company).filter(Company.id == target_id).first()
    if not company or not company.is_active:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Company not found or inactive",
        )
    return company


@router.get("", response_model=DashboardResponse)
def get_dashboard(
    company_id: int | None = Query(default=None),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """KPI numbers for the tenant overall + per-project breakdown.

    Visibility:
    - super_admin must pass ?company_id=
    - company_admin sees all projects of own company
    - company_user sees only projects granted to them
    - end_customer sees only projects of their units
    """
    company = _resolve_company(user, db, company_id)

    allowed_ids = allowed_project_ids_for(user, db)
    project_filter = Project.company_id == company.id
    if allowed_ids is not None:
        if not allowed_ids:
            # No project access — return an empty dashboard for this company.
            empty_status = StatusBreakdown()
            empty_source = SourceBreakdown()
            return DashboardResponse(
                company=CompanyKpi(
                    company_id=company.id,
                    company_name=company.name,
                    total_projects=0,
                    total_units=0,
                    total_defects=0,
                    open_defects=0,
                    pending_manager=0,
                    done_defects=0,
                    by_status=empty_status,
                    by_source=empty_source,
                ),
                projects=[],
            )
        project_filter = project_filter & Project.id.in_(allowed_ids)

    malf_filter = Malfunction.company_id == company.id
    if allowed_ids is not None:
        malf_filter = malf_filter & Malfunction.project_id.in_(allowed_ids)

    company_row = (
        db.query(
            func.count(Malfunction.id).label("total"),
            _status_count(MalfunctionStatus.PENDING_MANAGER).label("pending_manager"),
            _status_count(MalfunctionStatus.TODO).label("todo"),
            _status_count(MalfunctionStatus.NEGOTIATION).label("negotiation"),
            _status_count(MalfunctionStatus.FROZEN).label("frozen"),
            _status_count(MalfunctionStatus.DONE).label("done"),
            _status_count(MalfunctionStatus.CANCELLED).label("cancelled"),
            _source_count(MalfunctionSource.WHATSAPP).label("src_whatsapp"),
            _source_count(MalfunctionSource.MANUAL).label("src_manual"),
            _source_count(MalfunctionSource.BEDEK_REPORT).label("src_bedek"),
            _source_count(MalfunctionSource.INSPECTOR_TOUR).label("src_inspector"),
            _source_count(MalfunctionSource.DELIVERY_PROTOCOL).label("src_protocol"),
            _source_count(MalfunctionSource.EMAIL).label("src_email"),
        )
        .filter(malf_filter)
        .one()
    )

    total_projects = (
        db.query(func.count(Project.id))
        .filter(project_filter)
        .scalar()
        or 0
    )
    unit_filter = SaleUnit.company_id == company.id
    if allowed_ids is not None:
        unit_filter = unit_filter & SaleUnit.project_id.in_(allowed_ids)
    total_units = db.query(func.count(SaleUnit.id)).filter(unit_filter).scalar() or 0

    by_status = _status_breakdown_from_row(company_row)
    by_source = _source_breakdown_from_row(company_row)

    company_kpi = CompanyKpi(
        company_id=company.id,
        company_name=company.name,
        total_projects=total_projects,
        total_units=total_units,
        total_defects=company_row.total or 0,
        open_defects=by_status.pending_manager
        + by_status.todo
        + by_status.negotiation
        + by_status.frozen,
        pending_manager=by_status.pending_manager,
        done_defects=by_status.done,
        by_status=by_status,
        by_source=by_source,
    )

    project_rows = (
        db.query(
            Project.id.label("project_id"),
            Project.name.label("project_name"),
            Project.address.label("address"),
            func.count(Malfunction.id).label("total"),
            _status_count(MalfunctionStatus.PENDING_MANAGER).label("pending_manager"),
            _status_count(MalfunctionStatus.TODO).label("todo"),
            _status_count(MalfunctionStatus.NEGOTIATION).label("negotiation"),
            _status_count(MalfunctionStatus.FROZEN).label("frozen"),
            _status_count(MalfunctionStatus.DONE).label("done"),
            _status_count(MalfunctionStatus.CANCELLED).label("cancelled"),
            _source_count(MalfunctionSource.WHATSAPP).label("src_whatsapp"),
            _source_count(MalfunctionSource.MANUAL).label("src_manual"),
            _source_count(MalfunctionSource.BEDEK_REPORT).label("src_bedek"),
            _source_count(MalfunctionSource.INSPECTOR_TOUR).label("src_inspector"),
            _source_count(MalfunctionSource.DELIVERY_PROTOCOL).label("src_protocol"),
            _source_count(MalfunctionSource.EMAIL).label("src_email"),
        )
        .select_from(Project)
        .outerjoin(
            Malfunction,
            (Malfunction.project_id == Project.id)
            & (Malfunction.company_id == company.id),
        )
        .filter(project_filter)
        .group_by(Project.id, Project.name, Project.address)
        .order_by(Project.name)
        .all()
    )

    today = date.today()
    open_dates_by_project: dict[int, list[int]] = {}
    if project_rows:
        project_ids = [r.project_id for r in project_rows]
        open_defects = (
            db.query(Malfunction.project_id, Malfunction.opened_at)
            .filter(
                Malfunction.company_id == company.id,
                Malfunction.project_id.in_(project_ids),
                Malfunction.status.in_(OPEN_STATUSES),
            )
            .all()
        )
        for project_id, opened_at in open_defects:
            open_dates_by_project.setdefault(project_id, []).append(
                (today - opened_at).days
            )

    projects: list[ProjectKpi] = []
    for row in project_rows:
        p_status = _status_breakdown_from_row(row)
        p_source = _source_breakdown_from_row(row)
        ages = open_dates_by_project.get(row.project_id, [])
        avg_days = sum(ages) / len(ages) if ages else None
        projects.append(
            ProjectKpi(
                project_id=row.project_id,
                project_name=row.project_name,
                address=row.address,
                total=row.total or 0,
                open_count=p_status.pending_manager
                + p_status.todo
                + p_status.negotiation
                + p_status.frozen,
                pending_manager=p_status.pending_manager,
                todo=p_status.todo,
                negotiation=p_status.negotiation,
                done=p_status.done,
                avg_days_open=avg_days,
                by_status=p_status,
                by_source=p_source,
            )
        )

    return DashboardResponse(company=company_kpi, projects=projects)

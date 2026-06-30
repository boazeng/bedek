"""Reports API: filtered, printable malfunction reports.

A single read endpoint returns the malfunctions of a project that match the
supplied filters (all optional), together with the resolved header context the
frontend needs to render a PDF-ready document.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, user_can_access_project
from ..models import Project, ProjectItem, User
from ..schemas.report import ReportAppliedFilter, ReportResponse
from ..services import reports as svc


router = APIRouter(prefix="/api/reports", tags=["reports"])


def _node_name(db: Session, project_id: int, item_id: int | None) -> str | None:
    if item_id is None:
        return None
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    return item.name if item else None


@router.get("/malfunctions", response_model=ReportResponse)
def malfunctions_report(
    project_id: int = Query(...),
    building_id: int | None = Query(default=None),
    entrance_id: int | None = Query(default=None),
    unit_id: int | None = Query(default=None),
    professional: str | None = Query(default=None),
    status_: str | None = Query(default=None, alias="status"),
    source: str | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")

    rows = svc.build_malfunction_report(
        db,
        project_id,
        building_id=building_id,
        entrance_id=entrance_id,
        unit_id=unit_id,
        professional=professional or None,
        status=status_ or None,
        source=source or None,
    )

    applied: list[ReportAppliedFilter] = []
    bname = _node_name(db, project_id, building_id)
    if bname:
        applied.append(ReportAppliedFilter(label="בניין", value=bname))
    ename = _node_name(db, project_id, entrance_id)
    if ename:
        applied.append(ReportAppliedFilter(label="כניסה", value=ename))
    uname = _node_name(db, project_id, unit_id)
    if uname:
        applied.append(ReportAppliedFilter(label="דירה", value=uname))
    if professional:
        applied.append(ReportAppliedFilter(label="בעל מקצוע", value=professional))
    if status_:
        applied.append(
            ReportAppliedFilter(label="סטטוס", value=svc.STATUS_LABELS.get(status_, status_))
        )
    if source:
        applied.append(
            ReportAppliedFilter(label="מקור", value=svc.SOURCE_LABELS.get(source, source))
        )

    return ReportResponse(
        project_id=project.id,
        project_name=project.name,
        project_address=project.address,
        filters=applied,
        total=len(rows),
        rows=rows,
    )

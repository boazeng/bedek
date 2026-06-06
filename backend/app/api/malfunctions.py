"""Malfunctions (defects) API endpoints.

Read-only viewer for now — defects/activities can be created via seed or future
endpoints. Updates are limited to a few editable fields.
"""
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from ..deps import (
    get_current_user,
    get_db,
    require_company_admin,
    user_can_access_project,
)
from ..models import (
    Malfunction,
    MalfunctionActivity,
    Project,
    ProjectItem,
    User,
)
from ..schemas.malfunction import (
    BuildingSummary,
    MalfunctionActivityCreate,
    MalfunctionActivityOut,
    MalfunctionCreate,
    MalfunctionDetail,
    MalfunctionListItem,
    MalfunctionUpdate,
    UnitWithDefects,
)
from ..services import malfunctions as svc


router = APIRouter(prefix="/api/malfunctions", tags=["malfunctions"])


def _get_project_or_403(project_id: int, actor: User, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return project


@router.get("/buildings", response_model=list[BuildingSummary])
def list_buildings(
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    _get_project_or_403(project_id, actor, db)
    return svc.list_buildings(db, project_id)


@router.get("/units", response_model=list[UnitWithDefects])
def list_units_with_defects(
    project_id: int = Query(...),
    building_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    _get_project_or_403(project_id, actor, db)
    return svc.list_units_with_defects(db, project_id, building_id)


@router.get("/by-unit", response_model=list[MalfunctionListItem])
def list_defects_for_unit(
    project_id: int = Query(...),
    unit_id: int = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    _get_project_or_403(project_id, actor, db)
    return svc.list_defects_for_unit(db, project_id, unit_id)


@router.get("/{defect_id}", response_model=MalfunctionDetail)
def get_defect(
    defect_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    d = svc.get_defect(db, defect_id)
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    project = db.query(Project).filter(Project.id == d.project_id).first()
    if not project or not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return d


@router.post("", response_model=MalfunctionDetail, status_code=status.HTTP_201_CREATED)
def create_defect(
    body: MalfunctionCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = _get_project_or_403(body.project_id, actor, db)
    if body.project_item_id is not None:
        item = (
            db.query(ProjectItem)
            .filter(ProjectItem.id == body.project_item_id)
            .first()
        )
        if not item or item.project_id != body.project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project item not in this project",
            )
    d = Malfunction(
        company_id=project.company_id,
        project_id=body.project_id,
        project_item_id=body.project_item_id,
        buyer_id=body.buyer_id,
        status=body.status,
        source=body.source,
        group=body.group,
        description=body.description,
        professional=body.professional or None,
        opened_at=body.opened_at or date.today(),
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    detail = svc.get_defect(db, d.id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Create failed")
    return detail


@router.post(
    "/{defect_id}/activities",
    response_model=MalfunctionActivityOut,
    status_code=status.HTTP_201_CREATED,
)
def add_activity(
    defect_id: int,
    body: MalfunctionActivityCreate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    d = db.query(Malfunction).filter(Malfunction.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Defect not found")
    project = db.query(Project).filter(Project.id == d.project_id).first()
    if not project or not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    a = MalfunctionActivity(
        company_id=d.company_id,
        malfunction_id=defect_id,
        occurred_on=body.occurred_on or date.today(),
        action=body.action,
        notes=body.notes or None,
        performed_by=body.performed_by or None,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return MalfunctionActivityOut(
        id=a.id,
        occurred_on=a.occurred_on,
        action=a.action,
        notes=a.notes,
        performed_by=a.performed_by,
        created_at=a.created_at,
    )


@router.put("/{defect_id}", response_model=MalfunctionDetail)
def update_defect(
    defect_id: int,
    body: MalfunctionUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    d = db.query(Malfunction).filter(Malfunction.id == defect_id).first()
    if not d:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    project = db.query(Project).filter(Project.id == d.project_id).first()
    if not project or not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    if body.description is not None:
        d.description = body.description
    if body.professional is not None:
        d.professional = body.professional or None
    if body.status is not None:
        d.status = body.status
    if body.group is not None:
        d.group = body.group
    if body.closed_at is not None:
        d.closed_at = body.closed_at
    db.commit()
    return svc.get_defect(db, defect_id)

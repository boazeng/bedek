"""Sale units (entities per project: apartments, parking, storage, shops, public areas)."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import (
    allowed_project_ids_for,
    get_current_user,
    get_db,
    require_company_admin,
    user_can_access_project,
)
from ..models import Project, SaleUnit, User, UserRole
from ..schemas.admin import SaleUnitIn, SaleUnitOut


router = APIRouter(prefix="/api/sale-units", tags=["sale-units"])


def _get_project_or_403(project_id: int, actor: User, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Project not found"
        )
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return project


@router.get("", response_model=list[SaleUnitOut])
def list_sale_units(
    project_id: int = Query(...),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    project = _get_project_or_403(project_id, actor, db)
    return (
        db.query(SaleUnit)
        .filter(SaleUnit.project_id == project.id)
        .order_by(SaleUnit.unit_type, SaleUnit.unit_number)
        .all()
    )


@router.post("", response_model=SaleUnitOut, status_code=status.HTTP_201_CREATED)
def create_sale_unit(
    body: SaleUnitIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = _get_project_or_403(body.project_id, actor, db)
    unit = SaleUnit(
        company_id=project.company_id,
        project_id=project.id,
        unit_type=body.unit_type,
        unit_number=body.unit_number,
        entrance=body.entrance,
        floor=body.floor,
        buyer_id=body.buyer_id,
    )
    db.add(unit)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Unit with this type+number already exists in the project",
        )
    db.refresh(unit)
    return unit


@router.put("/{unit_id}", response_model=SaleUnitOut)
def update_sale_unit(
    unit_id: int,
    body: SaleUnitIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    unit = db.query(SaleUnit).filter(SaleUnit.id == unit_id).first()
    if not unit:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    project = _get_project_or_403(unit.project_id, actor, db)
    if body.project_id != unit.project_id:
        _get_project_or_403(body.project_id, actor, db)  # validate the new one too
        unit.project_id = body.project_id
    unit.unit_type = body.unit_type
    unit.unit_number = body.unit_number
    unit.entrance = body.entrance
    unit.floor = body.floor
    unit.buyer_id = body.buyer_id
    unit.company_id = project.company_id
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Conflicting unit"
        )
    db.refresh(unit)
    return unit


@router.delete("/{unit_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_sale_unit(
    unit_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    unit = db.query(SaleUnit).filter(SaleUnit.id == unit_id).first()
    if not unit:
        return
    _get_project_or_403(unit.project_id, actor, db)
    db.delete(unit)
    db.commit()

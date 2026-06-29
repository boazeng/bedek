"""Locations catalog — per-company sub-entities (סלון, מטבח, לובי קומתי, ...).

Used as a malfunction classification (chosen when opening a defect) and managed
by company admins on the company locations page."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_company_admin
from ..models import Company, LocationCatalog, SystemLocation, User, UserRole
from ..schemas.admin import LocationIn, LocationOut


class ReorderRequest(BaseModel):
    ids: list[int]


class ImportFromSystemSummary(BaseModel):
    """Returned by POST /api/locations/import-system — full-replacement import."""

    added: int = 0
    deleted: int = 0


router = APIRouter(prefix="/api/locations", tags=["locations"])


def _resolve_company(actor: User, requested: int | None, db: Session) -> int:
    if actor.role == UserRole.SUPER_ADMIN:
        if not requested:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super admin must pass company_id",
            )
        company = db.query(Company).filter(Company.id == requested).first()
        if not company:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Company not found"
            )
        return company.id
    if actor.company_id is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="No company assigned"
        )
    if requested and requested != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    return actor.company_id


@router.get("", response_model=list[LocationOut])
def list_locations(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    cid = _resolve_company(actor, company_id, db)
    return (
        db.query(LocationCatalog)
        .filter(LocationCatalog.company_id == cid)
        .order_by(LocationCatalog.sort_order, LocationCatalog.name)
        .all()
    )


@router.post("", response_model=LocationOut, status_code=status.HTTP_201_CREATED)
def create_location(
    body: LocationIn,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    cid = _resolve_company(actor, company_id, db)
    loc = LocationCatalog(company_id=cid, **body.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.post("/import-system", response_model=ImportFromSystemSummary)
def import_from_system(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Reset the company's location catalog to the system-wide default list.
    Full-replacement: existing rows are deleted, then every active system
    location is inserted in its current order."""
    cid = _resolve_company(actor, company_id, db)
    summary = ImportFromSystemSummary()

    summary.deleted = (
        db.query(LocationCatalog).filter(LocationCatalog.company_id == cid).count()
    )
    db.query(LocationCatalog).filter(LocationCatalog.company_id == cid).delete(
        synchronize_session=False
    )
    db.flush()

    sys_rows = (
        db.query(SystemLocation)
        .filter(SystemLocation.is_active.is_(True))
        .order_by(SystemLocation.sort_order, SystemLocation.id)
        .all()
    )
    for i, r in enumerate(sys_rows):
        db.add(LocationCatalog(company_id=cid, name=r.name, sort_order=i))
        summary.added += 1
    db.commit()
    return summary


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_locations(
    body: ReorderRequest,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Renumber all locations of the company in one shot (sort_order = 0, 1, 2…)."""
    cid = _resolve_company(actor, company_id, db)
    locations = (
        db.query(LocationCatalog).filter(LocationCatalog.company_id == cid).all()
    )
    by_id = {loc.id: loc for loc in locations}
    for loc_id in body.ids:
        if loc_id not in by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Location {loc_id} not found in this company",
            )
    for idx, loc_id in enumerate(body.ids):
        by_id[loc_id].sort_order = idx
    db.commit()


@router.put("/{loc_id}", response_model=LocationOut)
def update_location(
    loc_id: int,
    body: LocationIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    loc = db.query(LocationCatalog).filter(LocationCatalog.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if actor.role != UserRole.SUPER_ADMIN and loc.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    for k, v in body.model_dump().items():
        setattr(loc, k, v)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{loc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_location(
    loc_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    loc = db.query(LocationCatalog).filter(LocationCatalog.id == loc_id).first()
    if not loc:
        return
    if actor.role != UserRole.SUPER_ADMIN and loc.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    db.delete(loc)
    db.commit()

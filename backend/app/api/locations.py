"""Locations catalog — per-company sub-entities (סלון, מטבח, לובי קומתי, ...).

Also hosts the system-wide locations endpoints (the canonical list used by the
template picker and managed by super_admin via the SystemLocationsPage)."""
from io import BytesIO

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, status
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import (
    get_current_user,
    get_db,
    require_company_admin,
    require_super_admin,
)
from ..models import Company, LocationCatalog, SystemLocation, User, UserRole
from ..schemas.admin import LocationIn, LocationOut
from ..schemas.system_location import (
    SystemLocationImportSummary,
    SystemLocationIn,
    SystemLocationOut,
    SystemLocationReorderRequest,
)
from ..services import system_locations as sysloc_svc


class ReorderRequest(BaseModel):
    ids: list[int]


router = APIRouter(prefix="/api/locations", tags=["locations"])
# System-wide picker (distinct location names across all companies).
# Kept here for now; will move under a dedicated system_locations table later.
system_router = APIRouter(prefix="/api/system/locations", tags=["system-locations"])


@system_router.get("", response_model=list[str])
def list_system_locations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Names-only list used by the template editor's entity picker (active rows)."""
    rows = (
        db.query(SystemLocation.name)
        .filter(SystemLocation.is_active.is_(True))
        .order_by(SystemLocation.sort_order, SystemLocation.name)
        .all()
    )
    return [r[0] for r in rows]


@system_router.get("/detail", response_model=list[SystemLocationOut])
def list_system_locations_detail(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Full rows (id, code, is_active, sort_order) for the management page."""
    return (
        db.query(SystemLocation)
        .order_by(SystemLocation.sort_order, SystemLocation.id)
        .all()
    )


@system_router.post(
    "", response_model=SystemLocationOut, status_code=status.HTTP_201_CREATED
)
def create_system_location(
    body: SystemLocationIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    return sysloc_svc.create(db, body)


@system_router.put("/{loc_id}", response_model=SystemLocationOut)
def update_system_location(
    loc_id: int,
    body: SystemLocationIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    loc = db.query(SystemLocation).filter(SystemLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return sysloc_svc.update(db, loc, body)


@system_router.delete("/{loc_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_system_location(
    loc_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    loc = db.query(SystemLocation).filter(SystemLocation.id == loc_id).first()
    if not loc:
        return
    db.delete(loc)
    db.commit()


@system_router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_system_locations(
    body: SystemLocationReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    sysloc_svc.reorder(db, body.ids)


@system_router.get("/export.xlsx")
def export_system_locations(
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Stream the system_locations table as an XLSX file."""
    buf = sysloc_svc.export_xlsx(db)
    return StreamingResponse(
        buf,
        media_type=(
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        ),
        headers={
            "Content-Disposition": 'attachment; filename="system_locations.xlsx"'
        },
    )


@system_router.post(
    "/import.xlsx", response_model=SystemLocationImportSummary
)
async def import_system_locations(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Replace the system_locations table from an uploaded XLSX file.

    Rules: existing id → UPDATE in place; empty id → INSERT; ids in DB but not
    in the file → DELETE. Row order in the file = new sort_order.
    """
    data = await file.read()
    return sysloc_svc.import_xlsx(db, BytesIO(data))


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
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed"
        )
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


class ImportFromSystemSummary(BaseModel):
    """Returned by POST /api/locations/import-system — full-replacement import."""

    added: int = 0
    deleted: int = 0  # rows wiped from the previous company catalog


@router.post("/import-system", response_model=ImportFromSystemSummary)
def import_from_system(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Replace the company's catalog with every active SystemLocation.

    Full-replacement semantics — same as the XLSX import on the system list:
    the existing rows are deleted, then the system list is inserted in its
    current order. No sync/merge attempted (per user preference [[feedback-catalog-imports-full-replace]])."""
    cid = _resolve_company(actor, company_id, db)
    summary = ImportFromSystemSummary()

    summary.deleted = (
        db.query(LocationCatalog)
        .filter(LocationCatalog.company_id == cid)
        .count()
    )
    db.query(LocationCatalog).filter(
        LocationCatalog.company_id == cid
    ).delete(synchronize_session=False)
    db.flush()

    sys_rows = (
        db.query(SystemLocation)
        .filter(SystemLocation.is_active.is_(True))
        .order_by(SystemLocation.sort_order, SystemLocation.id)
        .all()
    )
    for i, r in enumerate(sys_rows):
        db.add(
            LocationCatalog(
                company_id=cid,
                name=r.name,
                applies_to_public_only=False,
                sort_order=i,
            )
        )
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
    """Renumber all locations of the company in one shot, in the order given.

    Sets `sort_order = 0, 1, 2, …` according to the position of each id in
    `body.ids`. This is the canonical way to reorder — robust against duplicate
    sort_order values that may have crept in from older swap-based updates."""
    cid = _resolve_company(actor, company_id, db)
    locations = (
        db.query(LocationCatalog).filter(LocationCatalog.company_id == cid).all()
    )
    by_id = {loc.id: loc for loc in locations}

    # Every id in the payload must belong to this company.
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

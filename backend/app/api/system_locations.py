"""System locations — system-wide catalog of location names (סלון, מטבח, …).

- GET is open to any authenticated user (so company catalogs / dropdowns can read).
- Write operations require super_admin.
Mirrors /api/system/professionals.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_super_admin
from ..models import SystemLocation, User
from ..schemas.admin import SystemLocationIn, SystemLocationOut


class SystemLocationReorderRequest(BaseModel):
    ids: list[int]


router = APIRouter(prefix="/api/system/locations", tags=["system-locations"])


@router.get("", response_model=list[SystemLocationOut])
def list_system_locations(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(SystemLocation)
        .order_by(SystemLocation.sort_order, SystemLocation.name)
        .all()
    )


@router.post("", response_model=SystemLocationOut, status_code=status.HTTP_201_CREATED)
def create_system_location(
    body: SystemLocationIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    loc = SystemLocation(**body.model_dump())
    db.add(loc)
    db.commit()
    db.refresh(loc)
    return loc


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_system_locations(
    body: SystemLocationReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Renumber all system locations in one shot. Sets sort_order = 0, 1, 2, …."""
    rows = db.query(SystemLocation).all()
    by_id = {r.id: r for r in rows}
    for loc_id in body.ids:
        if loc_id not in by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"System location {loc_id} not found",
            )
    for idx, loc_id in enumerate(body.ids):
        by_id[loc_id].sort_order = idx
    db.commit()


@router.put("/{loc_id}", response_model=SystemLocationOut)
def update_system_location(
    loc_id: int,
    body: SystemLocationIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    loc = db.query(SystemLocation).filter(SystemLocation.id == loc_id).first()
    if not loc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    for k, v in body.model_dump().items():
        setattr(loc, k, v)
    db.commit()
    db.refresh(loc)
    return loc


@router.delete("/{loc_id}", status_code=status.HTTP_204_NO_CONTENT)
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

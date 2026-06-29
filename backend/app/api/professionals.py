"""Professionals — system-wide catalog of tradespeople (חשמלאי, אינסטלטור, …).

- GET is open to any authenticated user (so dropdowns can populate).
- Write operations require super_admin.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_super_admin
from ..models import Professional, User
from ..schemas.admin import ProfessionalIn, ProfessionalOut


class ProfessionalReorderRequest(BaseModel):
    ids: list[int]


router = APIRouter(prefix="/api/system/professionals", tags=["professionals"])


@router.get("", response_model=list[ProfessionalOut])
def list_professionals(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(Professional)
        .order_by(Professional.sort_order, Professional.name)
        .all()
    )


@router.post("", response_model=ProfessionalOut, status_code=status.HTTP_201_CREATED)
def create_professional(
    body: ProfessionalIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    pro = Professional(**body.model_dump())
    db.add(pro)
    db.commit()
    db.refresh(pro)
    return pro


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_professionals(
    body: ProfessionalReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Renumber all professionals in one shot. Sets sort_order = 0, 1, 2, …."""
    pros = db.query(Professional).all()
    by_id = {p.id: p for p in pros}
    for pro_id in body.ids:
        if pro_id not in by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Professional {pro_id} not found",
            )
    for idx, pro_id in enumerate(body.ids):
        by_id[pro_id].sort_order = idx
    db.commit()


@router.put("/{pro_id}", response_model=ProfessionalOut)
def update_professional(
    pro_id: int,
    body: ProfessionalIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    pro = db.query(Professional).filter(Professional.id == pro_id).first()
    if not pro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    for k, v in body.model_dump().items():
        setattr(pro, k, v)
    db.commit()
    db.refresh(pro)
    return pro


@router.delete("/{pro_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_professional(
    pro_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    pro = db.query(Professional).filter(Professional.id == pro_id).first()
    if not pro:
        return
    db.delete(pro)
    db.commit()

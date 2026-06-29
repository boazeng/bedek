"""Buyers (לקוחות / רוכשים) — per-project customers of a company.

Listed on the customers page (optionally filtered to the active project) and
selectable as a unit's customer in the project structure builder."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_company_admin
from ..models import Buyer, Company, Project, User, UserRole
from ..schemas.buyer import BuyerIn, BuyerOut


router = APIRouter(prefix="/api/buyers", tags=["buyers"])


def _resolve_company(actor: User, requested: int | None, db: Session) -> int:
    if actor.role == UserRole.SUPER_ADMIN:
        if not requested:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Super admin must pass company_id",
            )
        company = db.query(Company).filter(Company.id == requested).first()
        if not company:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Company not found")
        return company.id
    if actor.company_id is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No company assigned")
    if requested and requested != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not allowed")
    return actor.company_id


def _out(b: Buyer) -> BuyerOut:
    return BuyerOut(
        id=b.id,
        company_id=b.company_id,
        project_id=b.project_id,
        name=b.display_name,
        nickname=b.nickname,
        phone=b.phone,
    )


def _split_name(name: str) -> tuple[str, str]:
    """Store the full name in first_name; keep last_name empty."""
    return name.strip(), ""


@router.get("", response_model=list[BuyerOut])
def list_buyers(
    company_id: int | None = Query(default=None),
    project_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    cid = _resolve_company(actor, company_id, db)
    q = db.query(Buyer).filter(Buyer.company_id == cid)
    if project_id is not None:
        # Include company-level buyers (no project yet) so they can be assigned
        # to this project's units.
        q = q.filter(or_(Buyer.project_id == project_id, Buyer.project_id.is_(None)))
    return [_out(b) for b in q.order_by(Buyer.id).all()]


@router.post("", response_model=BuyerOut, status_code=status.HTTP_201_CREATED)
def create_buyer(
    body: BuyerIn,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    cid = _resolve_company(actor, company_id, db)
    if body.project_id is not None:
        project = db.query(Project).filter(Project.id == body.project_id).first()
        if not project or project.company_id != cid:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Project must belong to this company",
            )
    first, last = _split_name(body.name)
    buyer = Buyer(
        company_id=cid,
        project_id=body.project_id,
        first_name=first,
        last_name=last,
        nickname=body.nickname or None,
        phone=body.phone or None,
    )
    db.add(buyer)
    db.commit()
    db.refresh(buyer)
    return _out(buyer)


@router.put("/{buyer_id}", response_model=BuyerOut)
def update_buyer(
    buyer_id: int,
    body: BuyerIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    buyer = db.query(Buyer).filter(Buyer.id == buyer_id).first()
    if not buyer:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if actor.role != UserRole.SUPER_ADMIN and buyer.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    first, last = _split_name(body.name)
    buyer.first_name = first
    buyer.last_name = last
    buyer.nickname = body.nickname or None
    buyer.phone = body.phone or None
    if body.project_id is not None:
        buyer.project_id = body.project_id
    db.commit()
    db.refresh(buyer)
    return _out(buyer)


@router.delete("/{buyer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_buyer(
    buyer_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    buyer = db.query(Buyer).filter(Buyer.id == buyer_id).first()
    if not buyer:
        return
    if actor.role != UserRole.SUPER_ADMIN and buyer.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    db.delete(buyer)
    db.commit()

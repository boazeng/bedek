"""Company professionals — per-company catalog of trade classifications.

The company-scoped counterpart of the system-wide professionals catalog
(`/api/system/professionals`). Mirrors the per-company locations endpoints:
super_admin must pass `company_id`; company_admin is locked to their own.
"""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_company_admin
from ..models import Company, CompanyProfessional, Professional, User, UserRole
from ..schemas.admin import CompanyProfessionalIn, CompanyProfessionalOut


class ReorderRequest(BaseModel):
    ids: list[int]


class ImportFromSystemSummary(BaseModel):
    """Returned by POST /api/professionals/import-system — full-replacement import."""

    added: int = 0
    deleted: int = 0  # rows wiped from the previous company catalog


router = APIRouter(prefix="/api/professionals", tags=["company-professionals"])


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


@router.get("", response_model=list[CompanyProfessionalOut])
def list_company_professionals(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    cid = _resolve_company(actor, company_id, db)
    return (
        db.query(CompanyProfessional)
        .filter(CompanyProfessional.company_id == cid)
        .order_by(CompanyProfessional.sort_order, CompanyProfessional.name)
        .all()
    )


@router.post("", response_model=CompanyProfessionalOut, status_code=status.HTTP_201_CREATED)
def create_company_professional(
    body: CompanyProfessionalIn,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    cid = _resolve_company(actor, company_id, db)
    pro = CompanyProfessional(company_id=cid, **body.model_dump())
    db.add(pro)
    db.commit()
    db.refresh(pro)
    return pro


@router.post("/import-system", response_model=ImportFromSystemSummary)
def import_from_system(
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Reset the company's classifications to the system-wide default list.

    Full-replacement semantics (same as the locations import): the company's
    existing rows are deleted, then every active system Professional is inserted
    in its current order. [[feedback-catalog-imports-full-replace]]"""
    cid = _resolve_company(actor, company_id, db)
    summary = ImportFromSystemSummary()

    summary.deleted = (
        db.query(CompanyProfessional)
        .filter(CompanyProfessional.company_id == cid)
        .count()
    )
    db.query(CompanyProfessional).filter(
        CompanyProfessional.company_id == cid
    ).delete(synchronize_session=False)
    db.flush()

    sys_rows = (
        db.query(Professional)
        .filter(Professional.is_active.is_(True))
        .order_by(Professional.sort_order, Professional.id)
        .all()
    )
    for i, r in enumerate(sys_rows):
        db.add(
            CompanyProfessional(
                company_id=cid,
                name=r.name,
                sort_order=i,
                is_active=True,
            )
        )
        summary.added += 1
    db.commit()
    return summary


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_company_professionals(
    body: ReorderRequest,
    company_id: int | None = Query(default=None),
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Renumber the company's professionals in one shot (sort_order = 0, 1, 2…)."""
    cid = _resolve_company(actor, company_id, db)
    pros = (
        db.query(CompanyProfessional)
        .filter(CompanyProfessional.company_id == cid)
        .all()
    )
    by_id = {p.id: p for p in pros}
    for pro_id in body.ids:
        if pro_id not in by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Professional {pro_id} not found in this company",
            )
    for idx, pro_id in enumerate(body.ids):
        by_id[pro_id].sort_order = idx
    db.commit()


@router.put("/{pro_id}", response_model=CompanyProfessionalOut)
def update_company_professional(
    pro_id: int,
    body: CompanyProfessionalIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    pro = db.query(CompanyProfessional).filter(CompanyProfessional.id == pro_id).first()
    if not pro:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    if actor.role != UserRole.SUPER_ADMIN and pro.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    for k, v in body.model_dump().items():
        setattr(pro, k, v)
    db.commit()
    db.refresh(pro)
    return pro


@router.delete("/{pro_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_company_professional(
    pro_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    pro = db.query(CompanyProfessional).filter(CompanyProfessional.id == pro_id).first()
    if not pro:
        return
    if actor.role != UserRole.SUPER_ADMIN and pro.company_id != actor.company_id:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    db.delete(pro)
    db.commit()

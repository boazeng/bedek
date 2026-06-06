"""Templates — composable library (system-wide + per-company).

Thin router; business logic lives in `services/templates.py`."""
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import or_
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_super_admin
from ..models import Template, User, UserRole
from ..schemas.template import (
    TemplateIn,
    TemplateListItem,
    TemplateOut,
    TemplateReorderRequest,
)
from ..services import templates as svc


router = APIRouter(prefix="/api/system/templates", tags=["templates"])


@router.get("", response_model=list[TemplateListItem])
def list_templates(
    company_id: int | None = Query(default=None),
    scope: str | None = Query(default=None, pattern="^(system|company)$"),
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    """List templates visible to the requester.

    - is_internal templates are NEVER returned (they're implementation detail).
    - `scope=system` → only templates with company_id IS NULL.
    - `scope=company` → only the requester's company templates (super_admin
      must pass `company_id` to pick which company).
    - no scope → legacy: system + own/specified company combined.
    """
    q = db.query(Template).filter(Template.is_internal.is_(False))

    if scope == "system":
        q = q.filter(Template.company_id.is_(None))
    elif scope == "company":
        if actor.role == UserRole.SUPER_ADMIN:
            if company_id is None:
                return []
            q = q.filter(Template.company_id == company_id)
        else:
            if actor.company_id is None:
                return []
            q = q.filter(Template.company_id == actor.company_id)
    else:
        # Default — system + own/specified company.
        if actor.role == UserRole.SUPER_ADMIN:
            if company_id is not None:
                q = q.filter(
                    or_(Template.company_id.is_(None), Template.company_id == company_id)
                )
        else:
            if actor.company_id is None:
                q = q.filter(Template.company_id.is_(None))
            else:
                q = q.filter(
                    or_(Template.company_id.is_(None), Template.company_id == actor.company_id)
                )

    rows = q.order_by(Template.sort_order, Template.name).all()
    return svc.serialize_list(rows, db)


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_templates(
    body: TemplateReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    svc.reorder_templates(db, body.ids)


@router.post(
    "/{template_id}/duplicate",
    response_model=TemplateOut,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    source = db.query(Template).filter(Template.id == template_id).first()
    if not source:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    clone = svc.duplicate_template(db, source)
    return svc.serialize_detail(clone, db)


@router.post("", response_model=TemplateOut, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    template = svc.create_template(db, body)
    return svc.serialize_detail(template, db)


@router.get("/{template_id}", response_model=TemplateOut)
def get_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return svc.serialize_detail(template, db)


@router.put("/{template_id}", response_model=TemplateOut)
def update_template(
    template_id: int,
    body: TemplateIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    template = svc.update_template(db, template, body)
    return svc.serialize_detail(template, db)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    template = db.query(Template).filter(Template.id == template_id).first()
    if not template:
        return
    db.delete(template)
    db.commit()

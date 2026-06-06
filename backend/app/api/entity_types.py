"""Entity types — system-wide catalog (דירה, חניה, שטח ציבורי, …).

- GET is open to any authenticated user (so dropdowns can populate).
- Write operations require super_admin.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..deps import get_current_user, get_db, require_super_admin
from ..models import EntityType, User
from ..schemas.admin import EntityTypeIn, EntityTypeOut


class EntityTypeReorderRequest(BaseModel):
    ids: list[int]


router = APIRouter(prefix="/api/system/entity-types", tags=["entity-types"])


@router.get("", response_model=list[EntityTypeOut])
def list_entity_types(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return (
        db.query(EntityType)
        .order_by(EntityType.sort_order, EntityType.name)
        .all()
    )


@router.post("", response_model=EntityTypeOut, status_code=status.HTTP_201_CREATED)
def create_entity_type(
    body: EntityTypeIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    entity = EntityType(**body.model_dump())
    db.add(entity)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Entity type with code '{body.code}' already exists",
        )
    db.refresh(entity)
    return entity


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_entity_types(
    body: EntityTypeReorderRequest,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    """Renumber all entity types in one shot. Sets sort_order = 0, 1, 2, …."""
    entities = db.query(EntityType).all()
    by_id = {e.id: e for e in entities}
    for entity_id in body.ids:
        if entity_id not in by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Entity type {entity_id} not found",
            )
    for idx, entity_id in enumerate(body.ids):
        by_id[entity_id].sort_order = idx
    db.commit()


@router.put("/{entity_id}", response_model=EntityTypeOut)
def update_entity_type(
    entity_id: int,
    body: EntityTypeIn,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    entity = db.query(EntityType).filter(EntityType.id == entity_id).first()
    if not entity:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    for k, v in body.model_dump().items():
        setattr(entity, k, v)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT, detail="Code conflict"
        )
    db.refresh(entity)
    return entity


@router.delete("/{entity_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_entity_type(
    entity_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_super_admin),
):
    entity = db.query(EntityType).filter(EntityType.id == entity_id).first()
    if not entity:
        return
    db.delete(entity)
    db.commit()

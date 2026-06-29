"""Project tree endpoints — view and mutate the buildings/entrances/floors/units
tree of a single project. Thin router; logic lives in services/project_items.py."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import (
    get_current_user,
    get_db,
    require_company_admin,
    user_can_access_project,
)
from ..models import Buyer, Project, ProjectItem, User
from ..schemas.project_item import (
    BulkAddUnitsRequest,
    DuplicateResponse,
    ProjectItemIn,
    ProjectItemNode,
    ProjectItemUpdate,
    ReorderRequest,
)
from ..services import project_items as svc


router = APIRouter(prefix="/api/projects/{project_id}/tree", tags=["project-tree"])


def _node(item: ProjectItem) -> ProjectItemNode:
    """Serialize a single item (no children) for create/update responses."""
    return ProjectItemNode(
        id=item.id,
        project_id=item.project_id,
        parent_id=item.parent_id,
        kind=item.kind,
        name=item.name,
        number=item.number,
        unit_type=item.unit_type,
        direction=item.direction,
        sort_order=item.sort_order,
        temp_apt_number=item.temp_apt_number,
        permanent_apt_number=item.permanent_apt_number,
        customer_name=item.customer_name,
        buyer_id=item.buyer_id,
        children=[],
    )


def _get_project_for_write(project_id: int, actor: User, db: Session) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return project


def _item_in_project(db: Session, project_id: int, item_id: int) -> ProjectItem:
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return item


@router.get("", response_model=list[ProjectItemNode])
def get_project_tree(
    project_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return svc.get_tree(db, project_id)


@router.post("/items", response_model=ProjectItemNode, status_code=status.HTTP_201_CREATED)
def create_project_item(
    project_id: int,
    body: ProjectItemIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = _get_project_for_write(project_id, actor, db)
    if body.parent_id is not None:
        parent = db.query(ProjectItem).filter(ProjectItem.id == body.parent_id).first()
        if not parent or parent.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent must belong to this project",
            )
    item = svc.create_item(
        db,
        company_id=project.company_id,
        project_id=project_id,
        parent_id=body.parent_id,
        kind=body.kind,
        name=body.name,
        number=body.number,
        unit_type=body.unit_type,
        direction=body.direction,
    )
    db.commit()
    return _node(item)


@router.put("/items/{item_id}", response_model=ProjectItemNode)
def update_project_item(
    project_id: int,
    item_id: int,
    body: ProjectItemUpdate,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = _get_project_for_write(project_id, actor, db)
    item = _item_in_project(db, project_id, item_id)
    svc.update_item(
        db,
        item,
        name=body.name,
        number=body.number,
        unit_type=body.unit_type,
        direction=body.direction,
        floor=body.floor,
        temp_apt_number=body.temp_apt_number,
        permanent_apt_number=body.permanent_apt_number,
        customer_name=body.customer_name,
    )
    # buyer_id: explicit field — present means set/clear (null clears the link).
    if "buyer_id" in body.model_fields_set:
        if body.buyer_id:
            buyer = (
                db.query(Buyer)
                .filter(Buyer.id == body.buyer_id, Buyer.company_id == project.company_id)
                .first()
            )
            if not buyer:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Buyer not found in this company",
                )
            item.buyer_id = buyer.id
        else:
            item.buyer_id = None
    db.commit()
    return _node(item)


@router.delete("/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project_item(
    project_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    _get_project_for_write(project_id, actor, db)
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    if not item:
        return
    db.delete(item)  # cascade via ondelete=CASCADE on parent_id
    db.commit()


@router.post(
    "/floors/{floor_id}/units",
    response_model=list[ProjectItemNode],
    status_code=status.HTTP_201_CREATED,
)
def add_units_to_floor(
    project_id: int,
    floor_id: int,
    body: BulkAddUnitsRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Bulk-add sale units to a floor (apartments auto-number per entrance)."""
    project = _get_project_for_write(project_id, actor, db)
    floor = _item_in_project(db, project_id, floor_id)
    created = svc.bulk_add_units(
        db,
        company_id=project.company_id,
        project_id=project_id,
        floor=floor,
        unit_type=body.unit_type,
        count=body.count,
        start_number=body.start_number,
        number=body.number,
    )
    db.commit()
    return [_node(c) for c in created]


@router.post("/renumber", status_code=status.HTTP_200_OK)
def renumber_project(
    project_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Re-sequence apartment numbers 1..N within each entrance."""
    _get_project_for_write(project_id, actor, db)
    changed = svc.renumber_apartments(db, project_id)
    db.commit()
    return {"renumbered": changed}


@router.post(
    "/items/{item_id}/duplicate",
    response_model=DuplicateResponse,
    status_code=status.HTTP_201_CREATED,
)
def duplicate_project_item(
    project_id: int,
    item_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Deep-clone an item (with all descendants) as a sibling of the original."""
    _get_project_for_write(project_id, actor, db)
    item = _item_in_project(db, project_id, item_id)
    new_root = svc.duplicate_subtree(db, item)
    db.commit()
    return DuplicateResponse(new_id=new_root.id, tree=svc.get_tree(db, project_id))


@router.post("/reorder", status_code=status.HTTP_204_NO_CONTENT)
def reorder_project_items(
    project_id: int,
    body: ReorderRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    _get_project_for_write(project_id, actor, db)
    svc.reorder_children(db, project_id, body.parent_id, body.ids)
    db.commit()

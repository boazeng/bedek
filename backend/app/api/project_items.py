"""Project tree endpoints — view and mutate the buildings/floors/units/locations
tree of a single project. Thin router; logic lives in services/project_items.py."""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ..deps import (
    get_current_user,
    get_db,
    require_company_admin,
    user_can_access_project,
)
from ..models import Project, ProjectItem, Template, User, UserRole
from ..schemas.project_item import (
    ApplyTemplateRequest,
    DuplicateResponse,
    ProjectItemIn,
    ProjectItemNode,
    ProjectItemUpdate,
    ReorderRequest,
)
from ..schemas.template import SaveAsTemplateRequest, TemplateOut
from ..services import project_items as svc
from ..services import templates as templates_svc


router = APIRouter(prefix="/api/projects/{project_id}/tree", tags=["project-tree"])


def _get_project_for_write(
    project_id: int, actor: User, db: Session
) -> Project:
    project = db.query(Project).filter(Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return project


@router.get("", response_model=list[ProjectItemNode])
def get_project_tree(
    project_id: int,
    db: Session = Depends(get_db),
    actor: User = Depends(get_current_user),
):
    project = (
        db.query(Project).filter(Project.id == project_id).first()
    )
    if not project:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Project not found")
    if not user_can_access_project(actor, project, db):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return svc.get_tree(db, project_id)


@router.post(
    "/items",
    response_model=ProjectItemNode,
    status_code=status.HTTP_201_CREATED,
)
def create_project_item(
    project_id: int,
    body: ProjectItemIn,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = _get_project_for_write(project_id, actor, db)
    # Validate parent is in same project.
    if body.parent_id is not None:
        parent = (
            db.query(ProjectItem)
            .filter(ProjectItem.id == body.parent_id)
            .first()
        )
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
        direction=body.direction,
        entity_type_id=body.entity_type_id,
        template_id=body.template_id,
    )
    db.commit()
    return svc.get_tree(db, project_id)[-1] if False else ProjectItemNode(
        id=item.id,
        project_id=item.project_id,
        parent_id=item.parent_id,
        kind=item.kind,
        name=item.name,
        number=item.number,
        direction=item.direction,
        entity_type_id=item.entity_type_id,
        template_id=item.template_id,
        sort_order=item.sort_order,
        children=[],
    )


@router.put("/items/{item_id}", response_model=ProjectItemNode)
def update_project_item(
    project_id: int,
    item_id: int,
    body: ProjectItemUpdate,
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
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    svc.update_item(
        db,
        item,
        name=body.name,
        number=body.number,
        direction=body.direction,
        floor=body.floor,
        temp_apt_number=body.temp_apt_number,
        permanent_apt_number=body.permanent_apt_number,
        customer_name=body.customer_name,
    )
    db.commit()
    return ProjectItemNode(
        id=item.id,
        project_id=item.project_id,
        parent_id=item.parent_id,
        kind=item.kind,
        name=item.name,
        number=item.number,
        direction=item.direction,
        entity_type_id=item.entity_type_id,
        template_id=item.template_id,
        sort_order=item.sort_order,
        temp_apt_number=item.temp_apt_number,
        permanent_apt_number=item.permanent_apt_number,
        customer_name=item.customer_name,
        children=[],
    )


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
    """Deep-clone an item (with all descendants) as a sibling of the original.
    Returns the new root's id so the UI can auto-expand the cloned subtree."""
    _get_project_for_write(project_id, actor, db)
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    new_root = svc.duplicate_subtree(db, item)
    db.commit()
    return DuplicateResponse(new_id=new_root.id, tree=svc.get_tree(db, project_id))


@router.post(
    "/items/{item_id}/save-as-template",
    response_model=TemplateOut,
    status_code=status.HTTP_201_CREATED,
)
def save_subtree_as_template(
    project_id: int,
    item_id: int,
    body: SaveAsTemplateRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    """Snapshot a project subtree (and all descendants) into a company template
    that can be reapplied later. Internal sub-templates are auto-generated for
    each nested floor/unit so the structure round-trips on apply."""
    project = _get_project_for_write(project_id, actor, db)
    item = (
        db.query(ProjectItem)
        .filter(ProjectItem.id == item_id, ProjectItem.project_id == project_id)
        .first()
    )
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    tpl = templates_svc.save_subtree_as_template(
        db,
        source=item,
        company_id=project.company_id,
        name=body.name,
        code=body.code,
        description=body.description,
    )
    return templates_svc.serialize_detail(tpl, db)


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


@router.post(
    "/apply-template",
    response_model=list[ProjectItemNode],
    status_code=status.HTTP_201_CREATED,
)
def apply_template_to_project(
    project_id: int,
    body: ApplyTemplateRequest,
    db: Session = Depends(get_db),
    actor: User = Depends(require_company_admin),
):
    project = _get_project_for_write(project_id, actor, db)
    template = db.query(Template).filter(Template.id == body.template_id).first()
    if not template:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Template not found")
    if body.parent_id is not None:
        parent = (
            db.query(ProjectItem)
            .filter(ProjectItem.id == body.parent_id)
            .first()
        )
        if not parent or parent.project_id != project_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Parent must belong to this project",
            )
    svc.apply_template(
        db,
        template=template,
        company_id=project.company_id,
        project_id=project_id,
        parent_id=body.parent_id,
    )
    db.commit()
    return svc.get_tree(db, project_id)

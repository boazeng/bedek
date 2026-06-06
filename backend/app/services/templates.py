"""Template orchestration: cycle detection, item replacement, serialization.

This is the only place that combines models + business logic for templates.
The API layer should call into these functions, not touch ORM directly for
write paths.
"""
from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models import (
    Company,
    EntityType,
    ProjectItem,
    ProjectItemKind,
    Template,
    TemplateFormat,
    TemplateItem,
    TemplateItemKind,
)
from ..schemas.template import (
    TemplateIn,
    TemplateItemIn,
    TemplateItemOut,
    TemplateListItem,
    TemplateOut,
)


def _would_create_cycle(
    parent_id: int | None, candidate_child_id: int, db: Session
) -> bool:
    """True iff adding `candidate_child_id` as a child of `parent_id` would
    create a cycle. `parent_id=None` means a brand-new template (no cycle
    possible yet because the template has no id), so we just check that the
    candidate doesn't (transitively) try to include itself — which it can't
    against a not-yet-persisted parent. So returns False in that case."""
    if parent_id is None:
        return False
    if parent_id == candidate_child_id:
        return True
    # BFS from the candidate downward; if we ever reach `parent_id`, cycle.
    visited: set[int] = set()
    stack: list[int] = [candidate_child_id]
    while stack:
        current = stack.pop()
        if current in visited:
            continue
        visited.add(current)
        if current == parent_id:
            return True
        children = (
            db.query(TemplateItem.child_template_id)
            .filter(
                TemplateItem.template_id == current,
                TemplateItem.item_kind == TemplateItemKind.CHILD_TEMPLATE,
                TemplateItem.child_template_id.isnot(None),
            )
            .all()
        )
        for (cid,) in children:
            if cid is not None and cid not in visited:
                stack.append(cid)
    return False


def _validate_item(
    item: TemplateItemIn, parent_id: int | None, db: Session
) -> None:
    if item.item_kind == TemplateItemKind.LOCATION:
        if not item.location_name or not item.location_name.strip():
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Location item must have a non-empty location_name",
            )
        if item.child_template_id is not None:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Location item must not have child_template_id",
            )
    elif item.item_kind == TemplateItemKind.CHILD_TEMPLATE:
        if not item.child_template_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Template item must have child_template_id",
            )
        child = (
            db.query(Template)
            .filter(Template.id == item.child_template_id)
            .first()
        )
        if not child:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Child template {item.child_template_id} not found",
            )
        if _would_create_cycle(parent_id, item.child_template_id, db):
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Adding template {item.child_template_id} would create a cycle",
            )
    else:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown item_kind '{item.item_kind}'",
        )
    if item.quantity < 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="quantity must be >= 1",
        )


def _replace_items(
    db: Session, template: Template, items: list[TemplateItemIn]
) -> None:
    """Replace the items of `template` with the given list (validated)."""
    for item in items:
        _validate_item(item, template.id, db)
    db.query(TemplateItem).filter(
        TemplateItem.template_id == template.id
    ).delete(synchronize_session=False)
    is_building = template.format == TemplateFormat.RESIDENTIAL_BUILDING
    for i, item in enumerate(items):
        db.add(
            TemplateItem(
                template_id=template.id,
                item_kind=item.item_kind,
                location_name=item.location_name if item.item_kind == "location" else None,
                child_template_id=item.child_template_id if item.item_kind == "template" else None,
                quantity=item.quantity,
                sort_order=i,
                label=item.label,
                floor=item.floor if is_building else None,
            )
        )


def _validate_format(fmt: str) -> None:
    if fmt not in (TemplateFormat.SIMPLE, TemplateFormat.RESIDENTIAL_BUILDING):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown template format '{fmt}'",
        )


def _entity_type_name(template: Template, db: Session) -> str | None:
    if template.entity_type_id is None:
        return None
    row = (
        db.query(EntityType.name)
        .filter(EntityType.id == template.entity_type_id)
        .first()
    )
    return row[0] if row else None


def serialize_detail(template: Template, db: Session) -> TemplateOut:
    items = (
        db.query(TemplateItem)
        .filter(TemplateItem.template_id == template.id)
        .order_by(TemplateItem.sort_order)
        .all()
    )
    name_by_id: dict[int, str] = {}
    child_ids = [i.child_template_id for i in items if i.child_template_id]
    if child_ids:
        for child_id, child_name in db.query(Template.id, Template.name).filter(
            Template.id.in_(child_ids)
        ).all():
            name_by_id[child_id] = child_name

    items_out = [
        TemplateItemOut(
            id=i.id,
            item_kind=i.item_kind,
            location_name=i.location_name,
            child_template_id=i.child_template_id,
            quantity=i.quantity,
            sort_order=i.sort_order,
            label=i.label,
            floor=i.floor,
            child_template_name=name_by_id.get(i.child_template_id)
            if i.child_template_id
            else None,
        )
        for i in items
    ]
    return TemplateOut(
        id=template.id,
        name=template.name,
        code=template.code,
        format=template.format,
        sort_order=template.sort_order,
        entity_type_id=template.entity_type_id,
        entity_type_name=_entity_type_name(template, db),
        company_id=template.company_id,
        description=template.description,
        is_active=template.is_active,
        items=items_out,
    )


def serialize_list(templates: list[Template], db: Session) -> list[TemplateListItem]:
    if not templates:
        return []
    ids = [t.id for t in templates]
    counts: dict[int, int] = {}
    from sqlalchemy import func

    rows = (
        db.query(TemplateItem.template_id, func.count(TemplateItem.id))
        .filter(TemplateItem.template_id.in_(ids))
        .group_by(TemplateItem.template_id)
        .all()
    )
    for tid, c in rows:
        counts[tid] = c

    et_ids = [t.entity_type_id for t in templates if t.entity_type_id]
    et_name_by_id: dict[int, str] = {}
    if et_ids:
        for et_id, et_name in db.query(EntityType.id, EntityType.name).filter(
            EntityType.id.in_(et_ids)
        ).all():
            et_name_by_id[et_id] = et_name

    company_ids = [t.company_id for t in templates if t.company_id]
    company_name_by_id: dict[int, str] = {}
    if company_ids:
        for cid, cname in db.query(Company.id, Company.name).filter(
            Company.id.in_(company_ids)
        ).all():
            company_name_by_id[cid] = cname

    return [
        TemplateListItem(
            id=t.id,
            name=t.name,
            code=t.code,
            format=t.format,
            sort_order=t.sort_order,
            entity_type_id=t.entity_type_id,
            entity_type_name=et_name_by_id.get(t.entity_type_id) if t.entity_type_id else None,
            company_id=t.company_id,
            company_name=company_name_by_id.get(t.company_id) if t.company_id else None,
            description=t.description,
            is_active=t.is_active,
            item_count=counts.get(t.id, 0),
        )
        for t in templates
    ]


def _next_sort_order(db: Session) -> int:
    from sqlalchemy import func

    row = db.query(func.max(Template.sort_order)).scalar()
    return (row or 0) + 1 if row is not None else 0


def create_template(db: Session, body: TemplateIn) -> Template:
    _validate_format(body.format)
    template = Template(
        name=body.name,
        code=body.code or None,
        format=body.format,
        entity_type_id=body.entity_type_id,
        company_id=body.company_id,
        description=body.description,
        is_active=body.is_active,
        sort_order=_next_sort_order(db),
    )
    db.add(template)
    try:
        db.flush()  # we need template.id before validating items (for cycle check)
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template code '{body.code}' is already in use",
        )
    _replace_items(db, template, body.items)
    db.commit()
    db.refresh(template)
    return template


def update_template(db: Session, template: Template, body: TemplateIn) -> Template:
    _validate_format(body.format)
    template.name = body.name
    template.code = body.code or None
    template.format = body.format
    template.entity_type_id = body.entity_type_id
    template.company_id = body.company_id
    template.description = body.description
    template.is_active = body.is_active
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template code '{body.code}' is already in use",
        )
    _replace_items(db, template, body.items)
    db.commit()
    db.refresh(template)
    return template


def duplicate_template(db: Session, source: Template) -> Template:
    """Deep-copy a template: new row + new item rows. Auto-name with a suffix."""
    suffix = " (עותק)"
    new_name = source.name + suffix
    # Ensure name uniqueness isn't required, but be polite — find unique-ish name.
    i = 2
    existing_names = {n for (n,) in db.query(Template.name).all()}
    while new_name in existing_names:
        new_name = f"{source.name}{suffix} {i}"
        i += 1

    clone = Template(
        name=new_name,
        code=None,  # codes are unique — don't copy
        format=source.format,
        entity_type_id=source.entity_type_id,
        company_id=source.company_id,
        is_internal=source.is_internal,
        description=source.description,
        is_active=source.is_active,
        sort_order=_next_sort_order(db),
    )
    db.add(clone)
    db.flush()

    # Copy items
    src_items = (
        db.query(TemplateItem)
        .filter(TemplateItem.template_id == source.id)
        .order_by(TemplateItem.sort_order)
        .all()
    )
    for src in src_items:
        db.add(
            TemplateItem(
                template_id=clone.id,
                item_kind=src.item_kind,
                location_name=src.location_name,
                child_template_id=src.child_template_id,
                quantity=src.quantity,
                sort_order=src.sort_order,
                label=src.label,
                floor=src.floor,
            )
        )
    db.commit()
    db.refresh(clone)
    return clone


def save_subtree_as_template(
    db: Session,
    *,
    source: ProjectItem,
    company_id: int,
    name: str,
    code: str | None = None,
    description: str | None = None,
) -> Template:
    """Snapshot a project subtree into a reusable template under the company.

    Implementation: the user-facing template (the one returned) holds the source
    node's name/code/description. For each child subtree (floor/unit) we
    recursively build an INTERNAL sub-template and link it as a CHILD_TEMPLATE
    item. Leaf locations become LOCATION items. Internal sub-templates are
    hidden from the catalog list but reachable by id when this template applies.
    """
    if not name.strip():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Template name is required",
        )

    def _build(node: ProjectItem, *, is_root: bool) -> Template:
        tpl = Template(
            name=name.strip() if is_root else f"{name.strip()} / {node.name}",
            code=(code or None) if is_root else None,
            # Format is now driven by entity_type — pick a sensible legacy default.
            format=TemplateFormat.SIMPLE,
            entity_type_id=node.entity_type_id,
            company_id=company_id,
            is_internal=not is_root,
            description=description if is_root else None,
            is_active=True,
            sort_order=_next_sort_order(db) if is_root else 0,
        )
        db.add(tpl)
        db.flush()

        # Load this node's children in tree order.
        children = (
            db.query(ProjectItem)
            .filter(ProjectItem.parent_id == node.id)
            .order_by(ProjectItem.sort_order, ProjectItem.id)
            .all()
        )
        for i, child in enumerate(children):
            if child.kind == ProjectItemKind.LOCATION:
                db.add(
                    TemplateItem(
                        template_id=tpl.id,
                        item_kind=TemplateItemKind.LOCATION,
                        location_name=child.name,
                        child_template_id=None,
                        quantity=1,
                        sort_order=i,
                        label=None,
                        floor=None,
                    )
                )
            else:
                # Subtree (building/floor/unit) → recurse, link as child template.
                sub_tpl = _build(child, is_root=False)
                db.add(
                    TemplateItem(
                        template_id=tpl.id,
                        item_kind=TemplateItemKind.CHILD_TEMPLATE,
                        location_name=None,
                        child_template_id=sub_tpl.id,
                        quantity=1,
                        sort_order=i,
                        label=None,
                        floor=None,
                    )
                )
        return tpl

    try:
        root_tpl = _build(source, is_root=True)
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Template code '{code}' is already in use",
        )
    db.refresh(root_tpl)
    return root_tpl


def reorder_templates(db: Session, ids: list[int]) -> None:
    """Renumber all templates by the given id order. Same pattern as locations
    /reorder — atomic single shot, robust to duplicates."""
    templates = db.query(Template).all()
    by_id = {t.id: t for t in templates}
    for tid in ids:
        if tid not in by_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Template {tid} not found",
            )
    for idx, tid in enumerate(ids):
        by_id[tid].sort_order = idx
    db.commit()

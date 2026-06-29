"""Project tree orchestration: load, serialize, apply templates."""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import (
    EntityType,
    ProjectItem,
    ProjectItemKind,
    Template,
    TemplateItem,
    TemplateItemKind,
)
from ..schemas.project_item import ProjectItemNode


# ---------- Hierarchical numbering ----------

# Letter prefix per kind in the hierarchical number (locations are just numeric,
# e.g. "...-U01-01" for the first location of unit 1). Floors contain
# apartments + public locations directly — there are no container units, so
# `unit` always maps to U.
KIND_NUMBER_PREFIX: dict[str, str] = {
    "building": "B",
    "floor": "F",
    "unit": "U",
    "location": "",
}


def _segment_prefix(kind: str) -> str:
    return KIND_NUMBER_PREFIX.get(kind, "")


# ---------- Read ----------

def get_tree(db: Session, project_id: int) -> list[ProjectItemNode]:
    """Build the full nested tree for a project (top-level items + descendants).

    Each node's `number` field is the auto-generated hierarchical code, e.g.
    `P00001-B01-F01-U01-01`. Computed on the fly from sort_order so it always
    reflects the current tree state without needing per-write updates."""
    rows = (
        db.query(ProjectItem)
        .filter(ProjectItem.project_id == project_id)
        .order_by(ProjectItem.sort_order, ProjectItem.id)
        .all()
    )

    # Pre-lookup entity_type and template names so the UI doesn't need extra calls.
    et_ids = {r.entity_type_id for r in rows if r.entity_type_id}
    tpl_ids = {r.template_id for r in rows if r.template_id}
    et_name: dict[int, str] = {}
    if et_ids:
        for i, n in db.query(EntityType.id, EntityType.name).filter(
            EntityType.id.in_(et_ids)
        ).all():
            et_name[i] = n
    tpl_name: dict[int, str] = {}
    if tpl_ids:
        for i, n in db.query(Template.id, Template.name).filter(
            Template.id.in_(tpl_ids)
        ).all():
            tpl_name[i] = n

    # Bucket by parent_id (keys are int or None for root).
    by_parent: dict[int | None, list[ProjectItem]] = defaultdict(list)
    for r in rows:
        by_parent[r.parent_id].append(r)
    # Each bucket is already sorted by the outer ORDER BY.

    project_code = f"P{project_id:05d}"

    def build(
        parent_id: int | None,
        parent_code: str,
        floor_name: str | None,
    ) -> list[ProjectItemNode]:
        items = by_parent.get(parent_id, [])
        out: list[ProjectItemNode] = []
        for idx, r in enumerate(items):
            prefix = _segment_prefix(r.kind)
            seg = f"{prefix}{idx + 1:02d}" if prefix else f"{idx + 1:02d}"
            full_number = f"{parent_code}-{seg}"
            # Floor label semantics:
            # - Floor row: its `floor` field (with name as fallback) — editable.
            # - Building row: nothing shown; doesn't carry a floor label.
            # - Unit/Location row: own `floor` override if set, otherwise
            #   inherits from the nearest ancestor that has a value. Editable.
            # Whatever a row displays, descendants inherit (so if a unit has its
            # own override, its locations follow that; if not, they follow the
            # floor — and changing the floor cascades automatically).
            if r.kind == ProjectItemKind.FLOOR:
                effective = r.floor or r.name
                shown_floor_name = effective
                child_floor_name = effective
            elif r.kind == ProjectItemKind.BUILDING:
                shown_floor_name = None
                child_floor_name = floor_name
            else:
                shown_floor_name = r.floor or floor_name
                child_floor_name = shown_floor_name
            node = ProjectItemNode(
                id=r.id,
                project_id=r.project_id,
                parent_id=r.parent_id,
                kind=r.kind,
                name=r.name,
                number=full_number,
                short_code=seg,
                direction=r.direction,
                entity_type_id=r.entity_type_id,
                entity_type_name=et_name.get(r.entity_type_id) if r.entity_type_id else None,
                template_id=r.template_id,
                template_name=tpl_name.get(r.template_id) if r.template_id else None,
                sort_order=r.sort_order,
                temp_apt_number=r.temp_apt_number,
                permanent_apt_number=r.permanent_apt_number,
                customer_name=r.customer_name,
                floor_name=shown_floor_name,
                children=build(r.id, full_number, child_floor_name),
            )
            out.append(node)
        return out

    return build(None, project_code, None)


# ---------- Mutate ----------

def _next_sort_order(db: Session, project_id: int, parent_id: int | None) -> int:
    current_max = (
        db.query(func.max(ProjectItem.sort_order))
        .filter(
            ProjectItem.project_id == project_id,
            ProjectItem.parent_id.is_(None) if parent_id is None else ProjectItem.parent_id == parent_id,
        )
        .scalar()
    )
    # NOTE: explicit None check — `current_max or -1` treats a valid 0 as falsy
    # and would cause every new sibling to land at sort_order=0 (and collide).
    return 0 if current_max is None else current_max + 1


def create_item(
    db: Session,
    *,
    company_id: int,
    project_id: int,
    parent_id: int | None,
    kind: str,
    name: str,
    number: str | None = None,
    direction: str | None = None,
    entity_type_id: int | None = None,
    template_id: int | None = None,
    sort_order: int | None = None,
) -> ProjectItem:
    if kind not in (
        ProjectItemKind.BUILDING,
        ProjectItemKind.FLOOR,
        ProjectItemKind.UNIT,
        ProjectItemKind.LOCATION,
    ):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST, detail=f"Unknown kind '{kind}'"
        )
    item = ProjectItem(
        company_id=company_id,
        project_id=project_id,
        parent_id=parent_id,
        kind=kind,
        name=name,
        number=number,
        direction=direction,
        entity_type_id=entity_type_id,
        template_id=template_id,
        sort_order=(
            sort_order
            if sort_order is not None
            else _next_sort_order(db, project_id, parent_id)
        ),
    )
    db.add(item)
    db.flush()
    return item


def update_item(
    db: Session,
    item: ProjectItem,
    *,
    name: str | None = None,
    number: str | None = None,
    direction: str | None = None,
    floor: str | None = None,
    temp_apt_number: str | None = None,
    permanent_apt_number: str | None = None,
    customer_name: str | None = None,
) -> ProjectItem:
    floor_changed_on_floor_row = False
    if name is not None:
        item.name = name
    if number is not None:
        item.number = number or None
    if direction is not None:
        item.direction = direction or None
    if floor is not None:
        new_floor = floor or None
        if item.kind == ProjectItemKind.FLOOR and new_floor != item.floor:
            floor_changed_on_floor_row = True
        item.floor = new_floor
    if temp_apt_number is not None:
        item.temp_apt_number = temp_apt_number or None
    if permanent_apt_number is not None:
        item.permanent_apt_number = permanent_apt_number or None
    if customer_name is not None:
        item.customer_name = customer_name or None

    # When a floor's own floor label changes, wipe stale per-row overrides on
    # every descendant so they re-inherit the new value. Without this, units
    # that had ever typed their own override would stay frozen on the old value.
    if floor_changed_on_floor_row:
        descendant_ids = [i for i in collect_descendants(db, item.id) if i != item.id]
        if descendant_ids:
            db.query(ProjectItem).filter(
                ProjectItem.id.in_(descendant_ids)
            ).update(
                {ProjectItem.floor: None}, synchronize_session=False
            )

    db.flush()
    return item


# ---------- Apply template ----------

def _kind_for_template(db: Session, t: Template) -> str:
    """Decide which ProjectItemKind a Template instantiates as.

    Priority:
    1. The template's explicit `kind` (set by save-as-template from the source
       project_item — survives even when the source had no entity_type).
    2. The kind from the template's entity_type (the picked-from-catalog path).
    3. UNIT as a safe last-resort default.
    """
    if t.kind:
        return t.kind
    if t.entity_type_id is None:
        return ProjectItemKind.UNIT
    et = db.query(EntityType).filter(EntityType.id == t.entity_type_id).first()
    if not et or not et.kind:
        return ProjectItemKind.UNIT
    return et.kind


def _template_items_sorted(db: Session, template_id: int) -> list[TemplateItem]:
    return (
        db.query(TemplateItem)
        .filter(TemplateItem.template_id == template_id)
        .order_by(TemplateItem.sort_order, TemplateItem.id)
        .all()
    )


def _instantiate_template_item(
    db: Session,
    *,
    company_id: int,
    project_id: int,
    parent_id: int | None,
    item: TemplateItem,
    visited: set[int],
) -> None:
    """Append one template item (location or template-ref) into the tree.

    Per-instance metadata stored on the TemplateItem (direction, floor, apt
    numbers) is restored onto the freshly created node so the apply round-trips
    the original project state."""
    if item.item_kind == TemplateItemKind.LOCATION:
        for _ in range(max(1, item.quantity or 1)):
            loc = create_item(
                db,
                company_id=company_id,
                project_id=project_id,
                parent_id=parent_id,
                kind=ProjectItemKind.LOCATION,
                name=item.label or item.location_name or "מיקום",
                direction=item.direction,
            )
            loc.floor = item.floor
            loc.temp_apt_number = item.temp_apt_number
            loc.permanent_apt_number = item.permanent_apt_number
            db.flush()
    elif item.item_kind == TemplateItemKind.CHILD_TEMPLATE and item.child_template_id:
        child = (
            db.query(Template)
            .filter(Template.id == item.child_template_id)
            .first()
        )
        if not child:
            return
        for _ in range(max(1, item.quantity or 1)):
            apply_template(
                db,
                template=child,
                company_id=company_id,
                project_id=project_id,
                parent_id=parent_id,
                visited=visited,
                overrides={
                    "name": item.label,
                    "direction": item.direction,
                    "floor": item.floor,
                    "temp_apt_number": item.temp_apt_number,
                    "permanent_apt_number": item.permanent_apt_number,
                },
            )


def apply_template(
    db: Session,
    *,
    template: Template,
    company_id: int,
    project_id: int,
    parent_id: int | None,
    visited: set[int] | None = None,
    overrides: dict | None = None,
) -> ProjectItem:
    """Expand `template` into ProjectItems under `parent_id`.

    Uniform behavior: create one wrapper node whose `kind` comes from the
    template's entity_type (building/floor/unit/location), then put the
    template's items inside.

    `overrides` carries per-instance metadata (name, direction, floor, apt
    numbers) supplied by the parent TemplateItem when this template is used
    as a CHILD_TEMPLATE. They take precedence over the template defaults.
    """
    visited = visited if visited is not None else set()
    if template.id in visited:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Template cycle detected at id {template.id}",
        )
    visited = visited | {template.id}
    ov = overrides or {}

    root_kind = _kind_for_template(db, template)
    root = create_item(
        db,
        company_id=company_id,
        project_id=project_id,
        parent_id=parent_id,
        kind=root_kind,
        name=ov.get("name") or template.name,
        direction=ov.get("direction"),
        entity_type_id=template.entity_type_id,
        template_id=template.id,
    )
    root.floor = ov.get("floor")
    root.temp_apt_number = ov.get("temp_apt_number")
    root.permanent_apt_number = ov.get("permanent_apt_number")
    db.flush()

    for ti in _template_items_sorted(db, template.id):
        _instantiate_template_item(
            db,
            company_id=company_id,
            project_id=project_id,
            parent_id=root.id,
            item=ti,
            visited=visited,
        )

    return root


# ---------- Reorder / Delete ----------

def reorder_children(db: Session, project_id: int, parent_id: int | None, ids: list[int]) -> None:
    rows = (
        db.query(ProjectItem)
        .filter(
            ProjectItem.project_id == project_id,
            ProjectItem.parent_id.is_(None) if parent_id is None else ProjectItem.parent_id == parent_id,
        )
        .all()
    )
    by_id = {r.id: r for r in rows}
    for i, item_id in enumerate(ids):
        if item_id in by_id:
            by_id[item_id].sort_order = i
    db.flush()


def duplicate_subtree(db: Session, source: ProjectItem) -> ProjectItem:
    """Deep-copy `source` and all its descendants. The copy is inserted
    DIRECTLY below the source (next sort_order under the same parent), with
    " (עותק)" appended to the root name so it's visually distinct."""

    # Shift every later sibling one slot down so the copy can take
    # source.sort_order + 1 without collisions.
    target_order = source.sort_order + 1
    sibling_filter = (
        ProjectItem.parent_id.is_(None)
        if source.parent_id is None
        else ProjectItem.parent_id == source.parent_id
    )
    db.query(ProjectItem).filter(
        ProjectItem.project_id == source.project_id,
        sibling_filter,
        ProjectItem.sort_order >= target_order,
        ProjectItem.id != source.id,
    ).update(
        {ProjectItem.sort_order: ProjectItem.sort_order + 1},
        synchronize_session=False,
    )
    db.flush()

    # New root node — same kind/refs/metadata, immediately after the source,
    # distinguishable name.
    new_root = create_item(
        db,
        company_id=source.company_id,
        project_id=source.project_id,
        parent_id=source.parent_id,
        kind=source.kind,
        name=f"{source.name} (עותק)",
        direction=source.direction,
        entity_type_id=source.entity_type_id,
        template_id=source.template_id,
        sort_order=target_order,
    )
    # Carry over the metadata fields that create_item doesn't take. These are
    # what makes the copy actually look like the source — floor label on a floor,
    # apt numbers on a unit, etc.
    new_root.floor = source.floor
    new_root.temp_apt_number = source.temp_apt_number
    new_root.permanent_apt_number = source.permanent_apt_number

    # DFS over descendants, preserving sibling order within each level.
    def _copy_children(old_parent_id: int, new_parent_id: int) -> None:
        children = (
            db.query(ProjectItem)
            .filter(ProjectItem.parent_id == old_parent_id)
            .order_by(ProjectItem.sort_order, ProjectItem.id)
            .all()
        )
        for c in children:
            clone = create_item(
                db,
                company_id=c.company_id,
                project_id=c.project_id,
                parent_id=new_parent_id,
                kind=c.kind,
                name=c.name,
                direction=c.direction,
                entity_type_id=c.entity_type_id,
                template_id=c.template_id,
            )
            clone.floor = c.floor
            clone.temp_apt_number = c.temp_apt_number
            clone.permanent_apt_number = c.permanent_apt_number
            _copy_children(c.id, clone.id)

    _copy_children(source.id, new_root.id)
    db.flush()
    return new_root


def collect_descendants(db: Session, item_id: int) -> Iterable[int]:
    """Yield item_id and all descendant ids (depth-first)."""
    stack = [item_id]
    while stack:
        current = stack.pop()
        yield current
        children = (
            db.query(ProjectItem.id)
            .filter(ProjectItem.parent_id == current)
            .all()
        )
        for (cid,) in children:
            stack.append(cid)

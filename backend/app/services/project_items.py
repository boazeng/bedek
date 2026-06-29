"""Project tree orchestration for the Building → Entrance → Floor → Unit model.

Single self-referential `project_items` table. The leaf `unit` is the sale
unit (יחידת ממכר) and carries `unit_type`. Hierarchical numbers (e.g.
`P00001-B01-E01-F02`) are computed on the fly from sort_order.
"""
from __future__ import annotations

from collections import defaultdict
from typing import Iterable

from fastapi import HTTPException, status
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import Buyer, ProjectItem, ProjectItemKind, SaleUnitType, UnitCustomer
from ..schemas.project_item import ProjectItemNode


# ---------- Hierarchical numbering ----------

# Letter prefix per structural kind. Units display their assigned number
# (apartment number etc.) instead of an auto segment.
KIND_NUMBER_PREFIX: dict[str, str] = {
    "building": "B",
    "entrance": "E",
    "floor": "F",
    "unit": "",
}

VALID_KINDS = (
    ProjectItemKind.BUILDING,
    ProjectItemKind.ENTRANCE,
    ProjectItemKind.FLOOR,
    ProjectItemKind.UNIT,
)

# Hebrew label per sale-unit type, used to name new unit nodes.
UNIT_TYPE_LABEL: dict[str, str] = {
    SaleUnitType.APARTMENT: "דירה",
    SaleUnitType.PARKING: "חניה",
    SaleUnitType.STORAGE: "מחסן",
    SaleUnitType.SHOP: "חנות",
    SaleUnitType.PUBLIC_AREA: "ציבורי",
}


# ---------- Read ----------

def get_tree(db: Session, project_id: int) -> list[ProjectItemNode]:
    """Build the full nested tree for a project (top-level items + descendants).

    Each node's `number` is the auto hierarchical code, e.g. `P00001-B01-E01-F02`.
    For units the segment is the assigned unit number when present."""
    rows = (
        db.query(ProjectItem)
        .filter(ProjectItem.project_id == project_id)
        .order_by(ProjectItem.sort_order, ProjectItem.id)
        .all()
    )

    by_parent: dict[int | None, list[ProjectItem]] = defaultdict(list)
    for r in rows:
        by_parent[r.parent_id].append(r)

    # Resolve linked buyer names in one query.
    buyer_ids = {r.buyer_id for r in rows if r.buyer_id}
    buyer_names: dict[int, str] = {}
    if buyer_ids:
        for b in db.query(Buyer).filter(Buyer.id.in_(buyer_ids)).all():
            buyer_names[b.id] = b.display_name

    # CRM customer links per unit (many-to-many), in one query.
    item_ids = [r.id for r in rows]
    customers_by_item: dict[int, list[int]] = defaultdict(list)
    if item_ids:
        for uc in db.query(UnitCustomer).filter(UnitCustomer.project_item_id.in_(item_ids)).all():
            customers_by_item[uc.project_item_id].append(uc.crm_membership_id)

    project_code = f"P{project_id:05d}"

    def build(
        parent_id: int | None,
        parent_code: str,
        floor_name: str | None,
    ) -> list[ProjectItemNode]:
        items = by_parent.get(parent_id, [])
        out: list[ProjectItemNode] = []
        for idx, r in enumerate(items):
            prefix = KIND_NUMBER_PREFIX.get(r.kind, "")
            if r.kind == ProjectItemKind.UNIT and r.number:
                seg = r.number
            elif prefix:
                seg = f"{prefix}{idx + 1:02d}"
            else:
                seg = f"{idx + 1:02d}"
            full_number = f"{parent_code}-{seg}"

            if r.kind == ProjectItemKind.FLOOR:
                effective = r.floor or r.name
                shown_floor_name = effective
                child_floor_name = effective
            elif r.kind in (ProjectItemKind.BUILDING, ProjectItemKind.ENTRANCE):
                shown_floor_name = None
                child_floor_name = floor_name
            else:  # unit
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
                unit_type=r.unit_type,
                direction=r.direction,
                sort_order=r.sort_order,
                temp_apt_number=r.temp_apt_number,
                permanent_apt_number=r.permanent_apt_number,
                customer_name=r.customer_name,
                buyer_id=r.buyer_id,
                buyer_name=buyer_names.get(r.buyer_id) if r.buyer_id else None,
                customer_membership_ids=customers_by_item.get(r.id, []),
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
    unit_type: str | None = None,
    direction: str | None = None,
    sort_order: int | None = None,
) -> ProjectItem:
    if kind not in VALID_KINDS:
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
        unit_type=unit_type,
        direction=direction,
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
    unit_type: str | None = None,
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
    if unit_type is not None:
        item.unit_type = unit_type or None
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


# ---------- Sale units (bulk add + numbering) ----------

def _ancestor_of_kind(db: Session, item: ProjectItem, kind: str) -> ProjectItem | None:
    """Walk up parents until a node of `kind` is found."""
    current = item
    while current is not None:
        if current.kind == kind:
            return current
        if current.parent_id is None:
            return None
        current = db.query(ProjectItem).filter(ProjectItem.id == current.parent_id).first()
    return None


def _apartment_numbers_under(db: Session, root_id: int) -> list[int]:
    """All numeric apartment numbers among descendants of `root_id`."""
    ids = list(collect_descendants(db, root_id))
    if not ids:
        return []
    rows = (
        db.query(ProjectItem.number)
        .filter(
            ProjectItem.id.in_(ids),
            ProjectItem.unit_type == SaleUnitType.APARTMENT,
            ProjectItem.number.isnot(None),
        )
        .all()
    )
    nums: list[int] = []
    for (n,) in rows:
        try:
            nums.append(int(n))
        except (TypeError, ValueError):
            continue
    return nums


def bulk_add_units(
    db: Session,
    *,
    company_id: int,
    project_id: int,
    floor: ProjectItem,
    unit_type: str,
    count: int = 1,
    start_number: int | None = None,
    number: str | None = None,
) -> list[ProjectItem]:
    """Create sale units under a floor.

    Apartments: `count` units auto-numbered continuously within the floor's
    ENTRANCE, starting at `start_number` (or the next free number). Other
    types: a single unit with the given `number`."""
    if floor.kind != ProjectItemKind.FLOOR:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Units can only be added under a floor",
        )
    if unit_type not in UNIT_TYPE_LABEL:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unknown unit_type '{unit_type}'",
        )

    label = UNIT_TYPE_LABEL[unit_type]
    created: list[ProjectItem] = []

    if unit_type == SaleUnitType.APARTMENT:
        entrance = _ancestor_of_kind(db, floor, ProjectItemKind.ENTRANCE)
        if start_number is None:
            existing = _apartment_numbers_under(db, entrance.id) if entrance else []
            start_number = (max(existing) + 1) if existing else 1
        for i in range(max(1, count)):
            num = start_number + i
            created.append(
                create_item(
                    db,
                    company_id=company_id,
                    project_id=project_id,
                    parent_id=floor.id,
                    kind=ProjectItemKind.UNIT,
                    name=f"{label} {num}",
                    number=str(num),
                    unit_type=unit_type,
                )
            )
    else:
        disp = (number or "").strip()
        created.append(
            create_item(
                db,
                company_id=company_id,
                project_id=project_id,
                parent_id=floor.id,
                kind=ProjectItemKind.UNIT,
                name=f"{label} {disp}".strip(),
                number=disp or None,
                unit_type=unit_type,
            )
        )
    return created


def renumber_apartments(db: Session, project_id: int) -> int:
    """Re-sequence apartment numbers 1..N within each entrance, in tree order.

    Returns the number of apartments renumbered."""
    rows = (
        db.query(ProjectItem)
        .filter(ProjectItem.project_id == project_id)
        .order_by(ProjectItem.sort_order, ProjectItem.id)
        .all()
    )
    by_parent: dict[int | None, list[ProjectItem]] = defaultdict(list)
    for r in rows:
        by_parent[r.parent_id].append(r)
    by_id = {r.id: r for r in rows}

    changed = 0

    def entrance_of(item: ProjectItem) -> int | None:
        cur = item
        while cur is not None:
            if cur.kind == ProjectItemKind.ENTRANCE:
                return cur.id
            cur = by_id.get(cur.parent_id) if cur.parent_id else None
        return None

    # counter per entrance, walking the tree depth-first in sibling order
    counters: dict[int | None, int] = defaultdict(lambda: 0)

    def walk(parent_id: int | None) -> None:
        nonlocal changed
        for r in by_parent.get(parent_id, []):
            if r.kind == ProjectItemKind.UNIT and r.unit_type == SaleUnitType.APARTMENT:
                ent = entrance_of(r)
                counters[ent] += 1
                new_num = str(counters[ent])
                if r.number != new_num:
                    r.number = new_num
                    r.name = f"{UNIT_TYPE_LABEL[SaleUnitType.APARTMENT]} {new_num}"
                    changed += 1
            walk(r.id)

    walk(None)
    db.flush()
    return changed


# ---------- Reorder / Delete / Duplicate ----------

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
    """Deep-copy `source` and all its descendants, inserted directly below it."""
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

    new_root = create_item(
        db,
        company_id=source.company_id,
        project_id=source.project_id,
        parent_id=source.parent_id,
        kind=source.kind,
        name=f"{source.name} (עותק)",
        number=source.number,
        unit_type=source.unit_type,
        direction=source.direction,
        sort_order=target_order,
    )
    new_root.floor = source.floor
    new_root.temp_apt_number = source.temp_apt_number
    new_root.permanent_apt_number = source.permanent_apt_number

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
                number=c.number,
                unit_type=c.unit_type,
                direction=c.direction,
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

"""Malfunctions service: aggregates defects across the project tree.

Walks the ProjectItem tree to roll up defects under each unit, and serializes
defect details with their activity timeline.
"""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models import (
    Buyer,
    LocationCatalog,
    Malfunction,
    MalfunctionActivity,
    MalfunctionStatus,
    ProjectItem,
    ProjectItemKind,
)
from ..schemas.malfunction import (
    BuildingSummary,
    MalfunctionActivityOut,
    MalfunctionDetail,
    MalfunctionListItem,
    UnitWithDefects,
)


OPEN_STATUSES = (
    MalfunctionStatus.PENDING_MANAGER,
    MalfunctionStatus.TODO,
    MalfunctionStatus.NEGOTIATION,
    MalfunctionStatus.FROZEN,
)


# ---------- Tree helpers ----------

def _project_items_by_parent(
    db: Session, project_id: int
) -> tuple[list[ProjectItem], dict[int | None, list[ProjectItem]]]:
    """Load all project items + build a parent_id → children mapping."""
    rows = (
        db.query(ProjectItem)
        .filter(ProjectItem.project_id == project_id)
        .order_by(ProjectItem.sort_order, ProjectItem.id)
        .all()
    )
    by_parent: dict[int | None, list[ProjectItem]] = defaultdict(list)
    for r in rows:
        by_parent[r.parent_id].append(r)
    return rows, by_parent


def _descendants_of(item_id: int, by_parent: dict[int | None, list[ProjectItem]]) -> list[int]:
    """All descendant project_item ids (depth-first), inclusive of `item_id`."""
    out: list[int] = []
    stack: list[int] = [item_id]
    while stack:
        cur = stack.pop()
        out.append(cur)
        for c in by_parent.get(cur, []):
            stack.append(c.id)
    return out


def _ancestor_unit_id(
    item: ProjectItem, by_id: dict[int, ProjectItem]
) -> int | None:
    """Return the nearest ancestor (or self) whose kind is 'unit'. Used to group
    defects under the unit that contains them, even when defect is on a location."""
    cur: ProjectItem | None = item
    while cur is not None:
        if cur.kind == ProjectItemKind.UNIT:
            return cur.id
        if cur.parent_id is None:
            return None
        cur = by_id.get(cur.parent_id)
    return None


def _floor_for(item: ProjectItem, by_id: dict[int, ProjectItem]) -> ProjectItem | None:
    cur: ProjectItem | None = item
    while cur is not None:
        if cur.kind == ProjectItemKind.FLOOR:
            return cur
        if cur.parent_id is None:
            return None
        cur = by_id.get(cur.parent_id)
    return None


def _is_descendant_of(
    item_id: int,
    ancestor_id: int,
    by_id: dict[int, ProjectItem],
) -> bool:
    cur: ProjectItem | None = by_id.get(item_id)
    while cur is not None:
        if cur.id == ancestor_id:
            return True
        if cur.parent_id is None:
            return False
        cur = by_id.get(cur.parent_id)
    return False


# ---------- Public ----------

def list_buildings(db: Session, project_id: int) -> list[BuildingSummary]:
    """Buildings of a project + count of open defects in each (for filtering)."""
    rows, _ = _project_items_by_parent(db, project_id)
    by_id: dict[int, ProjectItem] = {r.id: r for r in rows}
    buildings = [r for r in rows if r.kind == ProjectItemKind.BUILDING]

    # All open defects for this project, keyed by project_item_id.
    open_defects = (
        db.query(Malfunction.project_item_id)
        .filter(
            Malfunction.project_id == project_id,
            Malfunction.status.in_(OPEN_STATUSES),
            Malfunction.project_item_id.isnot(None),
        )
        .all()
    )
    open_pids = [pid for (pid,) in open_defects if pid is not None]

    out: list[BuildingSummary] = []
    for b in buildings:
        cnt = sum(1 for pid in open_pids if _is_descendant_of(pid, b.id, by_id))
        out.append(
            BuildingSummary(id=b.id, name=b.name, number=b.number, open_defects=cnt)
        )
    return out


def list_units_with_defects(
    db: Session, project_id: int, building_id: int | None
) -> list[UnitWithDefects]:
    """All units in the project (or just the chosen building) along with their
    open-defect count. A unit is an apartment (or any 'unit' kind) that lives
    directly under a floor — units never contain other units in the new model."""
    rows, by_parent = _project_items_by_parent(db, project_id)
    by_id: dict[int, ProjectItem] = {r.id: r for r in rows}

    # Optional filter to within a single building's subtree.
    if building_id is not None:
        descendants = set(_descendants_of(building_id, by_parent))
        rows_in_scope = [r for r in rows if r.id in descendants]
    else:
        rows_in_scope = rows

    # Open defects within scope.
    open_defects = (
        db.query(Malfunction)
        .filter(
            Malfunction.project_id == project_id,
            Malfunction.status.in_(OPEN_STATUSES),
            Malfunction.project_item_id.isnot(None),
        )
        .all()
    )
    if building_id is not None:
        descendants = set(_descendants_of(building_id, by_parent))
        open_defects = [
            d for d in open_defects if d.project_item_id in descendants
        ]

    # Group defects by their enclosing unit.
    by_unit: dict[int, list[Malfunction]] = defaultdict(list)
    for d in open_defects:
        item = by_id.get(d.project_item_id) if d.project_item_id else None
        if not item:
            continue
        unit_id = _ancestor_unit_id(item, by_id)
        if unit_id is None:
            continue
        by_unit[unit_id].append(d)

    units = [r for r in rows_in_scope if r.kind == ProjectItemKind.UNIT]

    # Customer/buyer name: derived from any descendant defect's buyer_id (best effort).
    buyer_ids: set[int] = set()
    for d in open_defects:
        if d.buyer_id:
            buyer_ids.add(d.buyer_id)
    buyer_name: dict[int, str] = {}
    if buyer_ids:
        for bid, fn, ln in db.query(Buyer.id, Buyer.first_name, Buyer.last_name).filter(
            Buyer.id.in_(buyer_ids)
        ).all():
            buyer_name[bid] = f"{fn} {ln}".strip()

    out: list[UnitWithDefects] = []
    for u in units:
        floor = _floor_for(u, by_id)
        # First defect's buyer is "the" customer (templates usually share).
        buyer = next(
            (
                buyer_name.get(d.buyer_id)
                for d in by_unit[u.id]
                if d.buyer_id and buyer_name.get(d.buyer_id)
            ),
            None,
        )
        out.append(
            UnitWithDefects(
                id=u.id,
                short_code=None,  # hierarchical code is computed elsewhere; skip here
                number=u.number,
                name=u.name,
                direction=u.direction,
                open_defects=len(by_unit[u.id]),
                customer_name=buyer,
                floor_name=floor.name if floor else None,
                floor_number=floor.number if floor else None,
            )
        )
    # Sort by floor number (best-effort numeric) then unit name.
    out.sort(
        key=lambda r: (
            r.floor_name or "",
            r.name or "",
        )
    )
    return out


def list_defects_for_unit(
    db: Session, project_id: int, unit_id: int
) -> list[MalfunctionListItem]:
    """All open defects on this unit and all its descendant locations."""
    _, by_parent = _project_items_by_parent(db, project_id)
    item_ids = set(_descendants_of(unit_id, by_parent))

    items_by_id = {
        i.id: i
        for i in db.query(ProjectItem)
        .filter(ProjectItem.id.in_(item_ids))
        .all()
    }
    defects = (
        db.query(Malfunction)
        .filter(
            Malfunction.project_id == project_id,
            Malfunction.status.in_(OPEN_STATUSES),
            Malfunction.project_item_id.in_(item_ids),
        )
        .order_by(Malfunction.opened_at.desc())
        .all()
    )
    loc_name = _location_names(db, [d.location_id for d in defects])
    return [
        MalfunctionListItem(
            id=d.id,
            project_item_id=d.project_item_id,
            project_item_name=(
                items_by_id[d.project_item_id].name
                if d.project_item_id and d.project_item_id in items_by_id
                else None
            ),
            location_id=d.location_id,
            location_name=loc_name.get(d.location_id) if d.location_id else None,
            status=d.status,
            source=d.source,
            group=d.group,
            description=d.description,
            professional=d.professional,
            opened_at=d.opened_at,
            closed_at=d.closed_at,
        )
        for d in defects
    ]


def _location_names(db: Session, ids: list[int | None]) -> dict[int, str]:
    """Batch-resolve LocationCatalog id → name."""
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    return {
        i: n
        for i, n in db.query(LocationCatalog.id, LocationCatalog.name)
        .filter(LocationCatalog.id.in_(wanted))
        .all()
    }


def get_defect(db: Session, defect_id: int) -> MalfunctionDetail | None:
    d = db.query(Malfunction).filter(Malfunction.id == defect_id).first()
    if not d:
        return None
    item = None
    if d.project_item_id:
        item = (
            db.query(ProjectItem)
            .filter(ProjectItem.id == d.project_item_id)
            .first()
        )
    location_name = _location_names(db, [d.location_id]).get(d.location_id)
    acts = (
        db.query(MalfunctionActivity)
        .filter(MalfunctionActivity.malfunction_id == defect_id)
        .order_by(MalfunctionActivity.occurred_on.desc(), MalfunctionActivity.id.desc())
        .all()
    )
    return MalfunctionDetail(
        id=d.id,
        project_id=d.project_id,
        project_item_id=d.project_item_id,
        project_item_name=item.name if item else None,
        project_item_number=item.number if item else None,
        location_id=d.location_id,
        location_name=location_name,
        status=d.status,
        source=d.source,
        group=d.group,
        description=d.description,
        professional=d.professional,
        assigned_to=d.assigned_to,
        opened_at=d.opened_at,
        closed_at=d.closed_at,
        created_at=d.created_at,
        updated_at=d.updated_at,
        activities=[
            MalfunctionActivityOut(
                id=a.id,
                occurred_on=a.occurred_on,
                action=a.action,
                notes=a.notes,
                performed_by=a.performed_by,
                created_at=a.created_at,
            )
            for a in acts
        ],
    )

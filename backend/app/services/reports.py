"""Reports service: filter malfunctions and resolve them into printable rows.

Filters are all optional and combine with AND. A building / entrance / unit
filter restricts to that node's subtree; professional / status / source match
the defect fields exactly. Only filters that were actually supplied are applied.

Rows are sorted for grouping: building → entrance → sale-unit, and within a
unit by location. Each row carries its activity timeline.
"""
from __future__ import annotations

from collections import defaultdict

from sqlalchemy.orm import Session

from ..models import (
    LocationCatalog,
    Malfunction,
    MalfunctionActivity,
    MalfunctionGroup,
    MalfunctionSource,
    MalfunctionStatus,
    ProjectItem,
    ProjectItemKind,
)
from ..schemas.report import ReportActivity, ReportRow
from . import malfunctions as malf_svc


STATUS_LABELS: dict[str, str] = {
    MalfunctionStatus.PENDING_MANAGER: "ממתין לאישור מנהל",
    MalfunctionStatus.FROZEN: "מוקפא",
    MalfunctionStatus.TODO: "לביצוע",
    MalfunctionStatus.NEGOTIATION: 'למו"מ מול הלקוח',
    MalfunctionStatus.DONE: "הסתיים טיפול",
    MalfunctionStatus.CANCELLED: "בוטל",
}

SOURCE_LABELS: dict[str, str] = {
    MalfunctionSource.WHATSAPP: "וואטסאפ",
    MalfunctionSource.MANUAL: "ידני",
    MalfunctionSource.BEDEK_REPORT: "דוח בדק",
    MalfunctionSource.INSPECTOR_TOUR: "סיור פיקוח",
    MalfunctionSource.DELIVERY_PROTOCOL: "פרוטוקול מסירה",
    MalfunctionSource.EMAIL: "אימייל",
}

GROUP_LABELS: dict[str, str] = {
    MalfunctionGroup.ELECTRICITY: "חשמל",
    MalfunctionGroup.PLUMBING: "אינסטלציה",
    MalfunctionGroup.FINISHES: "גמרים",
    MalfunctionGroup.STRUCTURE: "שלד",
    MalfunctionGroup.PROTECTION: "מיגון",
    MalfunctionGroup.SEALING: "איטום",
    MalfunctionGroup.ALUMINUM: "אלומיניום",
    MalfunctionGroup.UNASSIGNED: "טרם נבחר",
}

_BIG = 10**9   # sort sentinel for "no order / no value"


def _ancestor_nodes(
    item_id: int | None, by_id: dict[int, ProjectItem]
) -> dict[str, ProjectItem | None]:
    """Nearest building / entrance / floor / unit ancestor (inclusive of self)."""
    out: dict[str, ProjectItem | None] = {
        ProjectItemKind.BUILDING: None,
        ProjectItemKind.ENTRANCE: None,
        ProjectItemKind.FLOOR: None,
        ProjectItemKind.UNIT: None,
    }
    cur = by_id.get(item_id) if item_id is not None else None
    while cur is not None:
        if out.get(cur.kind) is None:
            out[cur.kind] = cur
        if cur.parent_id is None:
            break
        cur = by_id.get(cur.parent_id)
    return out


def _order_index(by_parent: dict[int | None, list[ProjectItem]]) -> dict[int, int]:
    """Depth-first position of every node — gives a stable hierarchical order."""
    idx: dict[int, int] = {}
    counter = 0

    def walk(parent: int | None) -> None:
        nonlocal counter
        for n in by_parent.get(parent, []):
            idx[n.id] = counter
            counter += 1
            walk(n.id)

    walk(None)
    return idx


def _short_number(
    base_full: str | None,
    ent_full: str | None,
    bld_full: str | None,
    project_id: int,
    seq: int,
) -> str:
    """Display number with the building/entrance prefix stripped (e.g. F01-7-1).

    Prefixes come from the tree-computed hierarchical numbers (e.g.
    P00001-B01-E01), not the raw per-level ProjectItem.number column.
    """
    prefix = ent_full or bld_full
    if base_full and prefix and base_full.startswith(prefix + "-"):
        short_base = base_full[len(prefix) + 1:]
    elif base_full:
        short_base = base_full
    else:
        short_base = None
    if short_base:
        return f"{short_base}-{seq}"
    return malf_svc.malfunction_number(base_full, project_id, seq)


def _location_sort(db: Session, ids: list[int | None]) -> dict[int, int]:
    wanted = {i for i in ids if i}
    if not wanted:
        return {}
    return {
        i: so
        for i, so in db.query(LocationCatalog.id, LocationCatalog.sort_order)
        .filter(LocationCatalog.id.in_(wanted))
        .all()
    }


def _activities_by_defect(
    db: Session, defect_ids: list[int]
) -> dict[int, list[MalfunctionActivity]]:
    if not defect_ids:
        return {}
    rows = (
        db.query(MalfunctionActivity)
        .filter(MalfunctionActivity.malfunction_id.in_(defect_ids))
        .order_by(MalfunctionActivity.occurred_on.asc(), MalfunctionActivity.id.asc())
        .all()
    )
    out: dict[int, list[MalfunctionActivity]] = defaultdict(list)
    for a in rows:
        out[a.malfunction_id].append(a)
    return out


def build_malfunction_report(
    db: Session,
    project_id: int,
    *,
    building_id: int | None = None,
    entrance_id: int | None = None,
    unit_id: int | None = None,
    professional: str | None = None,
    status: str | None = None,
    source: str | None = None,
) -> list[ReportRow]:
    """Return the filtered malfunctions of a project as grouped/sorted report rows."""
    rows, by_parent = malf_svc._project_items_by_parent(db, project_id)
    by_id: dict[int, ProjectItem] = {r.id: r for r in rows}
    order = _order_index(by_parent)

    # Tree scope: deepest supplied location filter wins (unit ⊂ entrance ⊂ building).
    scope_root = unit_id or entrance_id or building_id
    scope_ids: set[int] | None = None
    if scope_root is not None:
        scope_ids = set(malf_svc._descendants_of(scope_root, by_parent))

    q = db.query(Malfunction).filter(Malfunction.project_id == project_id)
    if scope_ids is not None:
        q = q.filter(Malfunction.project_item_id.in_(scope_ids))
    if professional:
        q = q.filter(Malfunction.professional == professional)
    if status:
        q = q.filter(Malfunction.status == status)
    if source:
        q = q.filter(Malfunction.source == source)
    defects = q.all()

    loc_name = malf_svc._location_names(db, [d.location_id for d in defects])
    loc_sort = _location_sort(db, [d.location_id for d in defects])
    unit_numbers = malf_svc._unit_numbers(db, project_id)
    acts_by_defect = _activities_by_defect(db, [d.id for d in defects])

    enriched: list[tuple[tuple, ReportRow]] = []
    for d in defects:
        anc = _ancestor_nodes(d.project_item_id, by_id)
        bld = anc.get(ProjectItemKind.BUILDING)
        ent = anc.get(ProjectItemKind.ENTRANCE)
        floor = anc.get(ProjectItemKind.FLOOR)
        unit = anc.get(ProjectItemKind.UNIT)

        base_full = unit_numbers.get(d.project_item_id) if d.project_item_id else None
        ent_full = unit_numbers.get(ent.id) if ent else None
        bld_full = unit_numbers.get(bld.id) if bld else None
        short = _short_number(base_full, ent_full, bld_full, d.project_id, d.seq)

        activities = [
            ReportActivity(
                number=f"{short}.{a.seq}" if a.seq else None,
                occurred_on=a.occurred_on,
                action=a.action,
                notes=a.notes,
                performed_by=a.performed_by,
            )
            for a in acts_by_defect.get(d.id, [])
        ]

        row = ReportRow(
            id=d.id,
            number=malf_svc.malfunction_number(base_full, d.project_id, d.seq),
            short_number=short,
            building_id=bld.id if bld else None,
            building_name=bld.name if bld else None,
            entrance_id=ent.id if ent else None,
            entrance_name=ent.name if ent else None,
            unit_id=unit.id if unit else None,
            unit_name=unit.name if unit else None,
            floor_name=floor.name if floor else None,
            location_name=loc_name.get(d.location_id) if d.location_id else None,
            professional=d.professional,
            status=d.status,
            status_label=STATUS_LABELS.get(d.status, d.status),
            source=d.source,
            source_label=SOURCE_LABELS.get(d.source, d.source),
            group=d.group,
            group_label=GROUP_LABELS.get(d.group, d.group),
            description=d.description,
            opened_at=d.opened_at,
            closed_at=d.closed_at,
            activities=activities,
        )

        sort_key = (
            order.get(bld.id, _BIG) if bld else _BIG,
            order.get(ent.id, _BIG) if ent else _BIG,
            order.get(unit.id, _BIG) if unit else _BIG,
            loc_sort.get(d.location_id, _BIG) if d.location_id else _BIG,
            d.location_id or 0,   # stable tiebreak so same-sort locations stay together
            d.seq,
        )
        enriched.append((sort_key, row))

    enriched.sort(key=lambda t: t[0])
    return [r for _, r in enriched]

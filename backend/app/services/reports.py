"""Reports service: filter malfunctions and resolve them into printable rows.

Filters are all optional and combine with AND. A building / entrance / unit
filter restricts to that node's subtree; professional / status / source match
the defect fields exactly. Only filters that were actually supplied are applied
(an empty field means "no restriction"), matching the page's behaviour.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from ..models import (
    Malfunction,
    MalfunctionGroup,
    MalfunctionSource,
    MalfunctionStatus,
    ProjectItem,
    ProjectItemKind,
)
from ..schemas.report import ReportRow
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


def _ancestors_by_kind(
    item_id: int | None, by_id: dict[int, ProjectItem]
) -> dict[str, str | None]:
    """Walk up the tree from an item, collecting the name of the nearest
    building / entrance / floor / unit ancestor (inclusive of the item itself)."""
    out: dict[str, str | None] = {
        ProjectItemKind.BUILDING: None,
        ProjectItemKind.ENTRANCE: None,
        ProjectItemKind.FLOOR: None,
        ProjectItemKind.UNIT: None,
    }
    cur = by_id.get(item_id) if item_id is not None else None
    while cur is not None:
        if out.get(cur.kind) is None:
            out[cur.kind] = cur.name
        if cur.parent_id is None:
            break
        cur = by_id.get(cur.parent_id)
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
    """Return the filtered malfunctions of a project as flat report rows."""
    rows, by_parent = malf_svc._project_items_by_parent(db, project_id)
    by_id: dict[int, ProjectItem] = {r.id: r for r in rows}

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

    defects = q.order_by(Malfunction.opened_at.desc(), Malfunction.id.desc()).all()

    loc_name = malf_svc._location_names(db, [d.location_id for d in defects])
    unit_numbers = malf_svc._unit_numbers(db, project_id)

    out: list[ReportRow] = []
    for d in defects:
        anc = _ancestors_by_kind(d.project_item_id, by_id)
        out.append(
            ReportRow(
                id=d.id,
                number=malf_svc.malfunction_number(
                    unit_numbers.get(d.project_item_id) if d.project_item_id else None,
                    d.project_id,
                    d.seq,
                ),
                building_name=anc.get(ProjectItemKind.BUILDING),
                entrance_name=anc.get(ProjectItemKind.ENTRANCE),
                floor_name=anc.get(ProjectItemKind.FLOOR),
                unit_name=anc.get(ProjectItemKind.UNIT),
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
            )
        )
    return out

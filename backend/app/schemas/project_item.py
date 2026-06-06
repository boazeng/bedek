"""Pydantic schemas for project tree items."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ProjectItemIn(BaseModel):
    """Create/update payload for a single tree node."""

    kind: str  # 'building' | 'floor' | 'unit' | 'location'
    name: str
    number: str | None = None
    direction: str | None = None
    entity_type_id: int | None = None
    template_id: int | None = None
    parent_id: int | None = None


class ProjectItemUpdate(BaseModel):
    """Partial update — only the editable user-facing fields."""

    name: str | None = None
    number: str | None = None
    direction: str | None = None
    floor: str | None = None
    temp_apt_number: str | None = None
    permanent_apt_number: str | None = None
    customer_name: str | None = None


class ProjectItemNode(BaseModel):
    """One node in the response tree. Children populated by the service."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    project_id: int
    parent_id: int | None
    kind: str
    name: str
    number: str | None         # full hierarchical code, e.g. P00001-B01-F02-U01-01
    short_code: str | None = None   # just the segment for this level, e.g. F02
    direction: str | None
    entity_type_id: int | None
    entity_type_name: str | None = None
    template_id: int | None
    template_name: str | None = None
    sort_order: int
    # Apartment-specific (kind=unit). Editable inline in the project tree UI.
    temp_apt_number: str | None = None
    permanent_apt_number: str | None = None
    # Free-text customer label shown next to the row name.
    customer_name: str | None = None
    # Name of the nearest FLOOR ancestor (None for buildings + floors themselves).
    # Derived during tree build — not stored.
    floor_name: str | None = None
    children: list["ProjectItemNode"] = []


class ApplyTemplateRequest(BaseModel):
    template_id: int
    parent_id: int | None = None  # null = add at project root


class DuplicateResponse(BaseModel):
    """Returned by POST /tree/items/{id}/duplicate. The new_id lets the UI
    auto-expand the freshly cloned subtree."""

    new_id: int
    tree: list[ProjectItemNode]


class ReorderRequest(BaseModel):
    """Reorder children of a single parent (or root if parent_id is null)."""

    parent_id: int | None = None
    ids: list[int]


# Resolve forward reference for the recursive node model.
ProjectItemNode.model_rebuild()

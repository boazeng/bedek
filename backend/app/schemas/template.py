"""Pydantic schemas for the templates module."""
from pydantic import BaseModel, ConfigDict


class TemplateItemIn(BaseModel):
    """One item submitted from the editor.

    Exactly one of `location_name` / `child_template_id` must be set, matching
    `item_kind` ('location' or 'template')."""

    item_kind: str
    location_name: str | None = None
    child_template_id: int | None = None
    quantity: int = 1
    label: str | None = None
    # Only meaningful when the parent template's format is residential_building.
    floor: str | None = None


class TemplateItemOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    item_kind: str
    location_name: str | None
    child_template_id: int | None
    quantity: int
    sort_order: int
    label: str | None
    floor: str | None = None
    # Populated by service when child_template_id is set, so the UI doesn't
    # need a second round trip to display the child's name.
    child_template_name: str | None = None


class TemplateIn(BaseModel):
    name: str
    code: str | None = None
    format: str = "simple"
    entity_type_id: int | None = None
    company_id: int | None = None
    description: str | None = None
    is_active: bool = True
    items: list[TemplateItemIn] = []


class TemplateListItem(BaseModel):
    """Lightweight summary returned by GET /templates (list view)."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str | None = None
    format: str = "simple"
    sort_order: int = 0
    entity_type_id: int | None
    entity_type_name: str | None = None
    # ProjectItem kind that this template instantiates (building/floor/unit/location).
    # Lets the UI filter the apply-template picker by level (e.g. only buildings).
    entity_type_kind: str | None = None
    company_id: int | None = None
    company_name: str | None = None
    description: str | None
    is_active: bool
    item_count: int = 0


class TemplateOut(BaseModel):
    """Detailed shape returned by GET /templates/{id}."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str | None = None
    format: str = "simple"
    sort_order: int = 0
    entity_type_id: int | None
    entity_type_name: str | None = None
    company_id: int | None
    description: str | None
    is_active: bool
    items: list[TemplateItemOut] = []


class SaveAsTemplateRequest(BaseModel):
    """Body for POST /tree/items/{id}/save-as-template — captures a project
    subtree as a reusable template under the project's company."""

    name: str
    code: str | None = None
    description: str | None = None


class TemplateReorderRequest(BaseModel):
    ids: list[int]

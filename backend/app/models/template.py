"""Composable templates — system-wide library used by all companies.

A Template is a named composition with metadata; each `TemplateItem` row is
either a free-form location label (e.g. "סלון") or a reference to another
template (so you can compose "בניין מגורים" out of "דירת 4 חדרים" sub-templates).

Both tables are system-wide (no company_id) — to be made overridable per-company
in a later iteration.
"""
from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class TemplateItemKind(StrEnum):
    LOCATION = "location"          # free-form location name string
    CHILD_TEMPLATE = "template"    # reference to another template


class TemplateFormat(StrEnum):
    # The template represents one apartment / leaf unit; applying it creates a
    # UNIT node and puts items (rooms, etc.) inside.
    SIMPLE = "simple"
    # The template represents a floor's contents; applying it expands items
    # (apartments + public locations) DIRECTLY under the floor — no wrapper node.
    FLOOR = "floor"
    # The template represents a whole residential building; items have a `floor`
    # label and applying it creates a BUILDING with one FLOOR per label.
    RESIDENTIAL_BUILDING = "residential_building"


class Template(Base):
    __tablename__ = "templates"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    # User-facing unique code (e.g. "APT-4R", "BLD-A"). Separate from id.
    code: Mapped[str | None] = mapped_column(String(60), unique=True)
    format: Mapped[str] = mapped_column(
        String(40), default=TemplateFormat.SIMPLE, nullable=False
    )
    entity_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("entity_types.id", ondelete="SET NULL")
    )
    # Explicit ProjectItem kind override (building/floor/unit/location). When
    # set, it wins over the entity_type's kind. Populated by save-as-template
    # so the wrapper kind survives even when the source had no entity_type set.
    kind: Mapped[str | None] = mapped_column(String(20))
    # null = system-wide (visible to all companies). Set = scoped to one company.
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE")
    )
    # Internal sub-templates created by save-as-template. They support a parent
    # template but are hidden from the catalog list and the picker.
    is_internal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class TemplateItem(Base):
    """One item inside a Template — either a location string or a child template."""

    __tablename__ = "template_items"
    __table_args__ = (
        Index("ix_template_items_parent", "template_id"),
        Index("ix_template_items_child", "child_template_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    template_id: Mapped[int] = mapped_column(
        ForeignKey("templates.id", ondelete="CASCADE"), nullable=False
    )

    item_kind: Mapped[str] = mapped_column(String(20), nullable=False)

    # When item_kind == LOCATION
    location_name: Mapped[str | None] = mapped_column(String(200))

    # When item_kind == CHILD_TEMPLATE
    child_template_id: Mapped[int | None] = mapped_column(
        ForeignKey("templates.id", ondelete="CASCADE")
    )

    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    label: Mapped[str | None] = mapped_column(String(200))   # optional display override
    # Per-instance metadata captured when a project subtree was saved as a
    # template. Restored verbatim on apply, regardless of who applies it where.
    floor: Mapped[str | None] = mapped_column(String(40))
    direction: Mapped[str | None] = mapped_column(String(20))
    temp_apt_number: Mapped[str | None] = mapped_column(String(40))
    permanent_apt_number: Mapped[str | None] = mapped_column(String(40))

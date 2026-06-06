"""Project tree: per-project instances of buildings → floors → units → locations.

Single self-referential table forms the tree. `kind` distinguishes the level.
"""
from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ProjectItemKind(StrEnum):
    BUILDING = "building"
    FLOOR = "floor"
    UNIT = "unit"
    LOCATION = "location"


class ProjectItem(Base):
    """One node in the project's hierarchical tree."""

    __tablename__ = "project_items"
    __table_args__ = (
        Index("ix_project_items_project", "project_id"),
        Index("ix_project_items_parent", "parent_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    parent_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_items.id", ondelete="CASCADE")
    )

    kind: Mapped[str] = mapped_column(String(20), nullable=False)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    number: Mapped[str | None] = mapped_column(String(40))
    direction: Mapped[str | None] = mapped_column(String(20))
    # Optional override for the "קומה" column. When null, the value is derived
    # from the nearest FLOOR ancestor's name. When set, this string wins.
    floor: Mapped[str | None] = mapped_column(String(40))
    # Temporary apartment number (e.g. assigned during construction).
    temp_apt_number: Mapped[str | None] = mapped_column(String(40))
    # Permanent apartment number (e.g. assigned at handover by Tabu/municipality).
    permanent_apt_number: Mapped[str | None] = mapped_column(String(40))
    # Free-text customer label shown inline beside the name in the tree UI.
    # (Free text for now; could later be promoted to a FK on the buyers table.)
    customer_name: Mapped[str | None] = mapped_column(String(200))

    # Optional metadata pointing back to system catalogs.
    entity_type_id: Mapped[int | None] = mapped_column(
        ForeignKey("entity_types.id", ondelete="SET NULL")
    )
    template_id: Mapped[int | None] = mapped_column(
        ForeignKey("templates.id", ondelete="SET NULL")
    )

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

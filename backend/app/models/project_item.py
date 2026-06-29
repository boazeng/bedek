"""Project tree: per-project instances of buildings → entrances → floors → units.

Single self-referential table forms the tree. `kind` distinguishes the level.
The leaf `unit` is the sale unit (יחידת ממכר) and carries `unit_type`.
"""
from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class ProjectItemKind(StrEnum):
    BUILDING = "building"      # בניין
    ENTRANCE = "entrance"      # כניסה
    FLOOR = "floor"            # קומה
    UNIT = "unit"              # יחידת ממכר (leaf; has unit_type)


class SaleUnitType(StrEnum):
    """Type of a leaf `unit` node (sale unit / יחידת ממכר)."""

    APARTMENT = "apartment"        # דירה
    PARKING = "parking"            # חניה
    STORAGE = "storage"            # מחסן
    SHOP = "shop"                  # חנות
    PUBLIC_AREA = "public_area"    # ציבורי


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
    # Sale-unit type — only set on leaf `unit` rows (apartment/parking/…).
    unit_type: Mapped[str | None] = mapped_column(String(30))
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

    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

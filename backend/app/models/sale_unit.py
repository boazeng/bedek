from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, DateTime, ForeignKey, Index, UniqueConstraint, Integer
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class SaleUnitType(StrEnum):
    APARTMENT = "apartment"        # דירה
    PARKING = "parking"            # חניה
    STORAGE = "storage"            # מחסן
    SHOP = "shop"                  # חנות
    PUBLIC_AREA = "public_area"    # שטח ציבורי


class SaleUnit(Base):
    """A sale unit (יחידת ממכר): apartment, parking, storage, shop, public area.
    (unit_type, unit_number, project_id) is the natural composite key per spec."""

    __tablename__ = "sale_units"
    __table_args__ = (
        UniqueConstraint("project_id", "unit_type", "unit_number", name="uq_unit_per_project"),
        Index("ix_sale_units_company", "company_id"),
        Index("ix_sale_units_project", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    unit_type: Mapped[str] = mapped_column(String(30), nullable=False)
    unit_number: Mapped[str] = mapped_column(String(40), nullable=False)
    entrance: Mapped[str | None] = mapped_column(String(20))
    floor: Mapped[str | None] = mapped_column(String(20))
    buyer_id: Mapped[int | None] = mapped_column(
        ForeignKey("buyers.id", ondelete="SET NULL")
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

from datetime import datetime, date

from sqlalchemy import String, DateTime, Date, ForeignKey, Index, Text
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class DeliveryProtocol(Base):
    """Delivery protocol for a sale unit (פרוטוקול מסירה)."""

    __tablename__ = "delivery_protocols"
    __table_args__ = (
        Index("ix_protocols_company", "company_id"),
        Index("ix_protocols_unit", "sale_unit_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    sale_unit_id: Mapped[int] = mapped_column(
        ForeignKey("sale_units.id", ondelete="CASCADE"), nullable=False
    )
    buyer_id: Mapped[int | None] = mapped_column(
        ForeignKey("buyers.id", ondelete="SET NULL")
    )
    protocol_date: Mapped[date] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    pdf_attachment_path: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

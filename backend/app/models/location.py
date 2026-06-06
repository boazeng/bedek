from datetime import datetime

from sqlalchemy import String, DateTime, ForeignKey, Boolean, Integer, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class LocationCatalog(Base):
    """Per-company catalog of location names (סלון, מטבח, ...), editable by the user.
    `applies_to_public_only` marks locations that only apply to public-area units."""

    __tablename__ = "location_catalog"
    __table_args__ = (Index("ix_locations_company", "company_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    applies_to_public_only: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


# Alias so callers can `from ..models import Location` if they want a short name.
Location = LocationCatalog

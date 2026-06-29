from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Boolean, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class CompanyProfessional(Base):
    """Per-company catalog of professional classifications / trades
    (אלומיניום, אינסטלציה, חשמל, …).

    The company-scoped counterpart of the system-wide `Professional` catalog,
    mirroring the SystemLocation ↔ LocationCatalog split.
    """

    __tablename__ = "company_professionals"
    __table_args__ = (Index("ix_company_prof_company", "company_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

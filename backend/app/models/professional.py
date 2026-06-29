from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Professional(Base):
    """System-wide catalog of professional classifications / trades
    (אלומיניום, אינסטלציה, חשמל, גמרים, …).

    Just the classification name — the actual tradesperson details are
    managed elsewhere. Shared across all companies.
    """

    __tablename__ = "professionals"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

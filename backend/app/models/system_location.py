from datetime import datetime

from sqlalchemy import String, DateTime, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class SystemLocation(Base):
    """System-wide catalog of location names (סלון, מטבח, לובי קומתי, …).

    Used as the canonical ordering source for the template editor's entity
    picker. Independent of per-company `location_catalog` rows. Managed by
    super_admin (UI: TBD).
    """

    __tablename__ = "system_locations"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(120), unique=True, nullable=False)
    code: Mapped[str | None] = mapped_column(String(60), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

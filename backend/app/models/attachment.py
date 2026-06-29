"""Generic file attachment — belongs to a malfunction OR a project item.

The bytes live in storage (S3 in prod / local dir in dev); this row holds the
storage key + metadata. Exactly one of malfunction_id / project_item_id is set.
"""
from datetime import datetime

from sqlalchemy import String, DateTime, Integer, ForeignKey, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class Attachment(Base):
    __tablename__ = "attachments"
    __table_args__ = (
        Index("ix_attachments_malfunction", "malfunction_id"),
        Index("ix_attachments_item", "project_item_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    malfunction_id: Mapped[int | None] = mapped_column(
        ForeignKey("malfunctions.id", ondelete="CASCADE")
    )
    project_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_items.id", ondelete="CASCADE")
    )
    storage_key: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(300))
    content_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    uploaded_by: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

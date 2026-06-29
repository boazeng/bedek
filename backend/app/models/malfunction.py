from datetime import datetime, date
from enum import StrEnum

from sqlalchemy import String, DateTime, Date, ForeignKey, Index, Text, Integer
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class MalfunctionStatus(StrEnum):
    PENDING_MANAGER = "pending_manager"   # ממתין לאישור מנהל
    FROZEN = "frozen"                     # מוקפא
    TODO = "todo"                         # לביצוע
    NEGOTIATION = "negotiation"           # למו"מ מול הלקוח
    DONE = "done"                         # הסתיים טיפול
    CANCELLED = "cancelled"               # בוטל


class MalfunctionSource(StrEnum):
    WHATSAPP = "whatsapp"
    MANUAL = "manual"
    BEDEK_REPORT = "bedek_report"         # דוח בדק
    INSPECTOR_TOUR = "inspector_tour"
    DELIVERY_PROTOCOL = "delivery_protocol"
    EMAIL = "email"


class MalfunctionGroup(StrEnum):
    ELECTRICITY = "electricity"           # חשמל
    PLUMBING = "plumbing"                 # אינסטלציה
    FINISHES = "finishes"                 # גמרים
    STRUCTURE = "structure"               # שלד
    PROTECTION = "protection"             # מיגון
    SEALING = "sealing"                   # איטום
    ALUMINUM = "aluminum"                 # אלומיניום
    UNASSIGNED = "unassigned"             # טרם נבחר


class Malfunction(Base):
    """The central malfunctions/defects table (טבלת ליקויים)."""

    __tablename__ = "malfunctions"
    __table_args__ = (
        Index("ix_malf_company", "company_id"),
        Index("ix_malf_project", "project_id"),
        Index("ix_malf_item", "project_item_id"),
        Index("ix_malf_status", "status"),
        Index("ix_malf_company_status", "company_id", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    buyer_id: Mapped[int | None] = mapped_column(
        ForeignKey("buyers.id", ondelete="SET NULL")
    )
    # Location classification (סיווג מיקום) chosen at open-time from the
    # per-company location catalog. No longer attached to the project tree.
    location_id: Mapped[int | None] = mapped_column(
        ForeignKey("location_catalog.id", ondelete="SET NULL")
    )
    # The sale unit (or any tree node) this defect belongs to.
    project_item_id: Mapped[int | None] = mapped_column(
        ForeignKey("project_items.id", ondelete="SET NULL")
    )
    # Free-text professional/tradesperson handling this defect. Will become a
    # FK once the per-tenant professionals catalog is built.
    professional: Mapped[str | None] = mapped_column(String(200))

    status: Mapped[str] = mapped_column(
        String(40), default=MalfunctionStatus.PENDING_MANAGER, nullable=False
    )
    source: Mapped[str] = mapped_column(
        String(40), default=MalfunctionSource.MANUAL, nullable=False
    )
    group: Mapped[str] = mapped_column(
        String(40), default=MalfunctionGroup.UNASSIGNED, nullable=False
    )

    description: Mapped[str] = mapped_column(Text, nullable=False)
    opened_at: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    closed_at: Mapped[date | None] = mapped_column(Date)
    assigned_to: Mapped[str | None] = mapped_column(String(200))

    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class MalfunctionActivity(Base):
    """One row per touch-point in the defect's lifecycle — e.g. "came to fix",
    "applied first coat of paint", etc. Append-only timeline."""

    __tablename__ = "malfunction_activities"
    __table_args__ = (Index("ix_malf_act_malf", "malfunction_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    malfunction_id: Mapped[int] = mapped_column(
        ForeignKey("malfunctions.id", ondelete="CASCADE"), nullable=False
    )
    occurred_on: Mapped[date] = mapped_column(Date, default=date.today, nullable=False)
    action: Mapped[str] = mapped_column(String(200), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    performed_by: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class MalfunctionAttachment(Base):
    """Documents / photos attached to a malfunction. Multiple per defect."""

    __tablename__ = "malfunction_attachments"
    __table_args__ = (Index("ix_malf_attach_malf", "malfunction_id"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    malfunction_id: Mapped[int] = mapped_column(
        ForeignKey("malfunctions.id", ondelete="CASCADE"), nullable=False
    )
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    original_filename: Mapped[str | None] = mapped_column(String(300))
    content_type: Mapped[str | None] = mapped_column(String(100))
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    uploaded_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

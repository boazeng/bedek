from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, DateTime, Integer, Boolean
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class EntityKind(StrEnum):
    """What project_item kind this entity instantiates as when a template
    referencing it is applied to a project. Mirrors ProjectItemKind."""

    BUILDING = "building"
    FLOOR = "floor"
    UNIT = "unit"
    LOCATION = "location"


class EntityType(Base):
    """System-wide catalog of complex entities (מבנה מגורים, דירה, קומה, …).

    A "complex entity" is one that can contain locations under it. Templates
    pick one of these as their type — applying the template creates a project
    node of the corresponding `kind`.
    """

    __tablename__ = "entity_types"

    id: Mapped[int] = mapped_column(primary_key=True)
    name: Mapped[str] = mapped_column(String(80), nullable=False)
    code: Mapped[str | None] = mapped_column(String(40), unique=True)
    # What ProjectItem kind a template of this entity creates when applied.
    kind: Mapped[str] = mapped_column(
        String(20), default=EntityKind.UNIT, nullable=False
    )
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

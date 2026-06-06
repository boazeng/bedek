"""Pydantic schemas for the system-wide locations catalog."""
from datetime import datetime

from pydantic import BaseModel, ConfigDict


class SystemLocationIn(BaseModel):
    """Body for POST / PUT — partial fields allowed on update via the API layer."""

    name: str
    code: str | None = None
    is_active: bool = True


class SystemLocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    code: str | None
    sort_order: int
    is_active: bool
    created_at: datetime


class SystemLocationReorderRequest(BaseModel):
    ids: list[int]


class SystemLocationImportSummary(BaseModel):
    """Returned by POST /import.xlsx so the UI can show what changed."""

    created: int = 0
    updated: int = 0
    deleted: int = 0
    errors: list[str] = []

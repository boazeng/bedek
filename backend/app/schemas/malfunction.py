"""Pydantic schemas for the malfunctions module."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict


# ---------- Sub-views ----------
class BuildingSummary(BaseModel):
    """Used for the building dropdown when filtering defects."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    number: str | None = None
    open_defects: int = 0


class UnitWithDefects(BaseModel):
    """One row in the 'units that have open defects' table."""

    id: int               # ProjectItem id
    short_code: str | None = None
    number: str | None = None
    name: str
    direction: str | None
    open_defects: int
    customer_name: str | None = None
    floor_name: str | None = None
    floor_number: str | None = None


# ---------- Activities ----------
class MalfunctionActivityOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    seq: int = 0
    number: str | None = None   # composed: {malfunction number}.{seq}
    occurred_on: date
    action: str
    notes: str | None
    performed_by: str | None
    created_at: datetime


# ---------- Defects ----------
class MalfunctionListItem(BaseModel):
    """Compact defect for the unit's defect list."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str | None = None
    project_item_id: int | None
    project_item_name: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    status: str
    source: str
    group: str
    urgency: str = "regular"
    description: str
    professional: str | None
    opened_at: date
    closed_at: date | None


class MalfunctionDetail(BaseModel):
    """Full defect payload including activity timeline."""

    model_config = ConfigDict(from_attributes=True)

    id: int
    number: str | None = None
    project_id: int
    project_item_id: int | None
    project_item_name: str | None = None
    project_item_number: str | None = None
    location_id: int | None = None
    location_name: str | None = None
    status: str
    source: str
    group: str
    urgency: str = "regular"
    description: str
    professional: str | None
    assigned_to: str | None
    opened_at: date
    closed_at: date | None
    customer_signed: bool = False
    customer_signature: str | None = None
    customer_signed_at: date | None = None
    created_at: datetime
    updated_at: datetime
    activities: list[MalfunctionActivityOut] = []


class MalfunctionUpdate(BaseModel):
    """Editable user-facing fields."""

    description: str | None = None
    professional: str | None = None
    status: str | None = None
    group: str | None = None
    urgency: str | None = None
    location_id: int | None = None   # room/location from company catalog; null clears
    closed_at: date | None = None
    customer_signed: bool | None = None
    customer_signature: str | None = None   # base64 PNG data-URL; "" clears it
    customer_signed_at: date | None = None


class MalfunctionCreate(BaseModel):
    """Payload for creating a brand-new defect."""

    project_id: int
    project_item_id: int | None = None
    location_id: int | None = None   # classification from company location catalog
    buyer_id: int | None = None
    description: str
    status: str = "pending_manager"
    source: str = "manual"
    group: str = "unassigned"
    urgency: str = "regular"
    professional: str | None = None
    opened_at: date | None = None   # defaults to today server-side
    customer_signed: bool = False
    customer_signature: str | None = None
    customer_signed_at: date | None = None


class MalfunctionActivityCreate(BaseModel):
    """Payload for appending a touch-point to a defect's timeline."""

    occurred_on: date | None = None   # defaults to today
    action: str
    notes: str | None = None
    performed_by: str | None = None

"""Pydantic schemas for buyers (לקוחות / רוכשים)."""
from pydantic import BaseModel


class BuyerIn(BaseModel):
    """Create/update payload. `name` is the full customer name."""

    name: str
    nickname: str | None = None
    phone: str | None = None
    project_id: int | None = None


class BuyerOut(BaseModel):
    id: int
    company_id: int
    project_id: int | None
    name: str
    nickname: str | None
    phone: str | None

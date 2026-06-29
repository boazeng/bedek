"""Pydantic schemas for admin / management CRUD endpoints."""
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, EmailStr


# ---------- Companies ----------
class CompanyIn(BaseModel):
    name: str
    slug: str
    contact_email: str | None = None
    phone: str | None = None
    is_active: bool = True


class CompanyOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    slug: str
    contact_email: str | None
    phone: str | None
    is_active: bool
    created_at: datetime


# ---------- Users ----------
class UserIn(BaseModel):
    full_name: str
    email: EmailStr
    phone: str | None = None
    role: str
    company_id: int | None = None
    has_all_projects: bool = False
    project_ids: list[int] | None = None   # only for company_user
    buyer_id: int | None = None
    is_active: bool = True


class UserOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    email: str
    phone: str | None
    role: str
    company_id: int | None
    has_all_projects: bool
    buyer_id: int | None
    is_active: bool
    created_at: datetime
    project_ids: list[int] = []


# ---------- Projects ----------
class ProjectIn(BaseModel):
    name: str
    address: str | None = None
    project_manager: str | None = None
    site_manager: str | None = None
    company_id: int | None = None   # set automatically for non-super_admin


class ProjectOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    address: str | None
    project_manager: str | None
    site_manager: str | None
    created_at: datetime


# ---------- Locations (sub-entities) ----------
class LocationIn(BaseModel):
    name: str
    applies_to_public_only: bool = False
    sort_order: int = 0


class LocationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    applies_to_public_only: bool
    sort_order: int


# ---------- Buyers ----------
class BuyerIn(BaseModel):
    first_name: str
    last_name: str
    phone: str | None = None
    email: EmailStr | None = None
    national_id: str | None = None


class BuyerOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    first_name: str
    last_name: str
    phone: str | None
    email: str | None
    national_id: str | None
    created_at: datetime


# ---------- Professionals (system-wide catalog of trade classifications) ----------
class ProfessionalIn(BaseModel):
    name: str
    sort_order: int = 0
    is_active: bool = True


class ProfessionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    name: str
    sort_order: int
    is_active: bool


# ---------- Company professionals (per-company trade classifications) ----------
class CompanyProfessionalIn(BaseModel):
    name: str
    sort_order: int = 0
    is_active: bool = True


class CompanyProfessionalOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    company_id: int
    name: str
    sort_order: int
    is_active: bool

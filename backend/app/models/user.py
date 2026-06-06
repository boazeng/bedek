from datetime import datetime
from enum import StrEnum

from sqlalchemy import String, DateTime, Boolean, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class UserRole(StrEnum):
    SUPER_ADMIN = "super_admin"        # cross-tenant, manages all companies
    COMPANY_ADMIN = "company_admin"    # manages users + everything inside one company
    COMPANY_USER = "company_user"      # works on assigned projects within a company
    END_CUSTOMER = "end_customer"      # buyer / resident — sees only own units


class User(Base):
    """A user. For super_admin the company_id is NULL (cross-tenant)."""

    __tablename__ = "users"
    __table_args__ = (
        UniqueConstraint("email", name="uq_users_email"),
        Index("ix_users_company", "company_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int | None] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE")
    )
    full_name: Mapped[str] = mapped_column(String(200), nullable=False)
    email: Mapped[str] = mapped_column(String(200), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(40))

    role: Mapped[str] = mapped_column(String(30), nullable=False)

    # For company_user: if True, has access to ALL projects of the company
    # (no rows needed in user_project_access). For other roles, ignored.
    has_all_projects: Mapped[bool] = mapped_column(
        Boolean, default=False, nullable=False
    )

    # For end_customer only: optional link to a Buyer record (if their identity
    # is also tracked as a buyer of one or more sale units).
    buyer_id: Mapped[int | None] = mapped_column(
        ForeignKey("buyers.id", ondelete="SET NULL")
    )

    # Reserved for Email+Password auth (Phase 2). Dev login ignores this.
    password_hash: Mapped[str | None] = mapped_column(String(255))

    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )


class UserProjectAccess(Base):
    """Granular project access for `company_user` role.
    Ignored when the user has `has_all_projects = True` or is admin/super_admin."""

    __tablename__ = "user_project_access"
    __table_args__ = (
        UniqueConstraint("user_id", "project_id", name="uq_user_project"),
        Index("ix_upa_user", "user_id"),
        Index("ix_upa_project", "project_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    project_id: Mapped[int] = mapped_column(
        ForeignKey("projects.id", ondelete="CASCADE"), nullable=False
    )
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    granted_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, nullable=False
    )

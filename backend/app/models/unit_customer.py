"""Link between a sale unit (project_item) and a CRM customer.

Many-to-many: a unit can have one or more customers, and the customer details
live in the CRM (referenced by `crm_membership_id`). Only the association is
stored in bedek.
"""
from sqlalchemy import Integer, ForeignKey, UniqueConstraint, Index
from sqlalchemy.orm import Mapped, mapped_column

from ..database import Base


class UnitCustomer(Base):
    __tablename__ = "unit_customers"
    __table_args__ = (
        UniqueConstraint("project_item_id", "crm_membership_id", name="uq_unit_customer"),
        Index("ix_unit_customers_item", "project_item_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    company_id: Mapped[int] = mapped_column(
        ForeignKey("companies.id", ondelete="CASCADE"), nullable=False
    )
    project_item_id: Mapped[int] = mapped_column(
        ForeignKey("project_items.id", ondelete="CASCADE"), nullable=False
    )
    # CRM customer membership id (company-scoped stable id in TACT-CRM).
    crm_membership_id: Mapped[int] = mapped_column(Integer, nullable=False)

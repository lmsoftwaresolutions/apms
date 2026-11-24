from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.shift import ShiftTemplate


class PolicyMaster(Base):
    __tablename__ = "policy_master"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_policy_master_tenant_id"),
        UniqueConstraint("tenant_id", "code", name="uq_policy_master_tenant_code"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    # Grace & Allowances (Minutes)
    late_arrival_allow_minutes: Mapped[int] = mapped_column(Integer, default=0)
    early_departure_allow_minutes: Mapped[int] = mapped_column(Integer, default=0)
    early_arrival_ignore_minutes: Mapped[int] = mapped_column(Integer, default=0)
    late_departure_ignore_minutes: Mapped[int] = mapped_column(Integer, default=0)

    # Attendance Status Thresholds
    half_day_work_duration_minutes: Mapped[int] = mapped_column(Integer, default=240)
    full_day_work_duration_minutes: Mapped[int] = mapped_column(Integer, default=480)
    half_day_late_cutoff_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    absent_late_cutoff_minutes: Mapped[int | None] = mapped_column(Integer, default=None)

    # Overtime Controls
    ot_minimum_minutes: Mapped[int] = mapped_column(Integer, default=30)
    ot_multiplier: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("1.50"))
    max_ot_minutes_per_day: Mapped[int | None] = mapped_column(Integer, default=None)

    # Punch Rules
    in_out_rule: Mapped[str] = mapped_column(String(30), default="FIRST_IN_LAST_OUT")

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    shift_templates: Mapped[list["ShiftTemplate"]] = relationship(
        back_populates="policy",
    )

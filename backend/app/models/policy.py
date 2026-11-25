from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, ForeignKeyConstraint, Integer, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.shift import ShiftTemplate


class PolicyMaster(Base):
    __tablename__ = "policy_master"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_policy_master_tenant_id"),
        UniqueConstraint("tenant_id", "code", name="uq_policy_master_tenant_code"),
        ForeignKeyConstraint(
            ["tenant_id", "late_penalty_leave_type_id"],
            ["leave_types.tenant_id", "leave_types.id"],
            name="fk_policy_late_penalty_leave",
            ondelete="RESTRICT",
        ),
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
    half_day_work_duration_minutes: Mapped[int] = mapped_column(Integer)
    full_day_work_duration_minutes: Mapped[int] = mapped_column(Integer)
    half_day_late_cutoff_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    absent_late_cutoff_minutes: Mapped[int | None] = mapped_column(Integer, default=None)

    # Overtime Controls
    ot_minimum_minutes: Mapped[int] = mapped_column(Integer, default=30)
    ot_multiplier: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("1.50"))
    max_ot_minutes_per_day: Mapped[int | None] = mapped_column(Integer, default=None)

    # Punch Rules
    in_out_rule: Mapped[str] = mapped_column(String(30), default="FIRST_IN_LAST_OUT")

    # Work Modes & Mode-Gated Controls
    wfh_monthly_auto_quota: Mapped[int] = mapped_column(Integer, default=4)
    allow_wfh_overtime: Mapped[bool] = mapped_column(Boolean, default=False)
    ot_approval_mode: Mapped[str] = mapped_column(String(30), default="ALWAYS_REQUIRE_APPROVAL")
    max_free_lates_per_month: Mapped[int] = mapped_column(Integer, default=3)
    late_penalty_action: Mapped[str] = mapped_column(String(30), default="WARNING")
    late_penalty_leave_type_id: Mapped[UUID | None] = mapped_column(default=None)

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    shift_templates: Mapped[list["ShiftTemplate"]] = relationship(
        back_populates="policy",
    )

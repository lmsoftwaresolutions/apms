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
    ot_multiplier: Mapped[Decimal | None] = mapped_column(Numeric(3, 2), default=None)
    extra_hours_amount: Mapped[Decimal | None] = mapped_column(Numeric(12, 2), default=None)
    extra_hours_amount_unit: Mapped[str | None] = mapped_column(String(10), default=None)
    max_ot_minutes_per_day: Mapped[int | None] = mapped_column(Integer, default=None)

    # Punch Rules
    in_out_rule: Mapped[str] = mapped_column(String(30), default="FIRST_IN_LAST_OUT")

    # Work Modes & Mode-Gated Controls
    allow_wfh: Mapped[bool] = mapped_column(Boolean, default=True)
    wfh_auto_approval_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    wfh_monthly_auto_quota: Mapped[int | None] = mapped_column(Integer, default=None)
    allow_overtime: Mapped[bool] = mapped_column(Boolean, default=True)
    overtime_auto_approval_enabled: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_wfh_overtime: Mapped[bool] = mapped_column(Boolean, default=False)
    wfh_ot_requires_approval: Mapped[bool] = mapped_column(Boolean, default=True)
    ot_approval_mode: Mapped[str] = mapped_column(String(30), default="ALWAYS_REQUIRE_APPROVAL")
    ot_auto_approve_threshold_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    quarterly_ot_cap_minutes: Mapped[int | None] = mapped_column(Integer, default=None)
    comp_off_minutes_per_day: Mapped[int | None] = mapped_column(Integer, default=None)
    max_free_lates_per_month: Mapped[int] = mapped_column(Integer, default=3)
    late_penalty_action: Mapped[str] = mapped_column(String(30), default="WARNING")
    late_penalty_leave_type_id: Mapped[UUID | None] = mapped_column(default=None)

    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    shift_templates: Mapped[list["ShiftTemplate"]] = relationship(
        back_populates="policy",
    )
    scope_overrides: Mapped[list["PolicyScopeOverride"]] = relationship(
        back_populates="policy",
    )


class PolicyScopeOverride(Base):
    __tablename__ = "policy_scope_overrides"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_policy_scope_overrides_tenant_id"),
        UniqueConstraint("tenant_id", "scope_type", "scope_id", name="uq_policy_scope_tenant_type_id"),
        ForeignKeyConstraint(
            ["tenant_id", "policy_id"],
            ["policy_master.tenant_id", "policy_master.id"],
            name="fk_policy_scope_policy",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    policy_id: Mapped[UUID | None] = mapped_column(default=None)
    scope_type: Mapped[str] = mapped_column(String(20))  # 'EMPLOYEE', 'DEPARTMENT', 'DESIGNATION'
    scope_id: Mapped[UUID]
    allow_wfh: Mapped[bool | None] = mapped_column(Boolean, default=None)
    wfh_monthly_quota: Mapped[int | None] = mapped_column(Integer, default=None)
    wfh_quota_mode: Mapped[str] = mapped_column(String(20), default="ABSOLUTE")  # 'ABSOLUTE', 'ADDITIVE'
    allow_overtime: Mapped[bool | None] = mapped_column(Boolean, default=None)
    ot_approval_mode: Mapped[str | None] = mapped_column(String(30), default=None)
    allow_wfh_overtime: Mapped[bool | None] = mapped_column(Boolean, default=None)
    wfh_ot_requires_approval: Mapped[bool | None] = mapped_column(Boolean, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    policy: Mapped["PolicyMaster | None"] = relationship(back_populates="scope_overrides")

from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


def _validate_extra_hours_amount(amount: Decimal | None, unit: str | None) -> None:
    if amount is not None and amount > 0 and unit is None:
        raise ValueError("Set the extra-hours unit (minute, hour, or day) when an amount is entered.")
    if unit is not None and (amount is None or amount == 0):
        raise ValueError("An extra-hours unit applies only when the amount is greater than zero.")


class PolicyBase(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    is_active: bool = True

    # Grace & Allowances (Minutes)
    late_arrival_allow_minutes: int = Field(default=0, ge=0)
    early_departure_allow_minutes: int = Field(default=0, ge=0)
    early_arrival_ignore_minutes: int = Field(default=0, ge=0)
    late_departure_ignore_minutes: int = Field(default=0, ge=0)

    # Attendance Status Thresholds
    half_day_work_duration_minutes: int = Field(ge=0)
    full_day_work_duration_minutes: int = Field(ge=0)
    half_day_late_cutoff_minutes: int | None = Field(default=None, ge=0)
    absent_late_cutoff_minutes: int | None = Field(default=None, ge=0)

    # Overtime Controls. Rates stay empty until an admin sets them.
    ot_minimum_minutes: int = Field(default=30, ge=0)
    ot_multiplier: Decimal | None = Field(default=None, ge=0)
    extra_hours_amount: Decimal | None = Field(default=None, ge=0)
    extra_hours_amount_unit: Literal["MINUTE", "HOUR", "DAY"] | None = None
    max_ot_minutes_per_day: int | None = Field(default=None, ge=0)

    # Punch Rules
    in_out_rule: Literal["FIRST_IN_LAST_OUT", "ALL_IN_OUT"] = "FIRST_IN_LAST_OUT"

    # Work Modes & Mode-Gated Controls
    allow_wfh: bool = True
    wfh_auto_approval_enabled: bool = False
    wfh_monthly_auto_quota: int = Field(default=4, ge=0)
    allow_overtime: bool = True
    overtime_auto_approval_enabled: bool = False
    allow_wfh_overtime: bool = False
    wfh_ot_requires_approval: bool = True
    ot_approval_mode: Literal[
        "ALWAYS_REQUIRE_APPROVAL",
        "AUTO_APPROVE_ALL",
        "AUTO_APPROVE_BELOW_THRESHOLD",
        "WFH_ONLY",
        "THRESHOLD_BASED",
        "DISABLED",
    ] = "ALWAYS_REQUIRE_APPROVAL"
    ot_auto_approve_threshold_minutes: int = Field(default=0, ge=0)
    max_free_lates_per_month: int = Field(default=3, ge=0)
    late_penalty_action: Literal["WARNING", "DEDUCT_LEAVE_HALF_DAY", "LOSS_OF_PAY"] = "WARNING"
    late_penalty_leave_type_id: UUID | None = None


class PolicyCreate(PolicyBase):
    @model_validator(mode="after")
    def validate_thresholds(self) -> "PolicyCreate":
        if self.half_day_work_duration_minutes >= self.full_day_work_duration_minutes:
            raise ValueError("half_day_work_duration_minutes must be strictly less than full_day_work_duration_minutes")
        if (
            self.half_day_late_cutoff_minutes is not None
            and self.absent_late_cutoff_minutes is not None
            and self.half_day_late_cutoff_minutes >= self.absent_late_cutoff_minutes
        ):
            raise ValueError("half_day_late_cutoff_minutes must be strictly less than absent_late_cutoff_minutes")
        _validate_extra_hours_amount(self.extra_hours_amount, self.extra_hours_amount_unit)
        return self


class PolicyUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    description: str | None = None
    is_active: bool | None = None

    late_arrival_allow_minutes: int | None = Field(default=None, ge=0)
    early_departure_allow_minutes: int | None = Field(default=None, ge=0)
    early_arrival_ignore_minutes: int | None = Field(default=None, ge=0)
    late_departure_ignore_minutes: int | None = Field(default=None, ge=0)

    half_day_work_duration_minutes: int | None = Field(default=None, ge=0)
    full_day_work_duration_minutes: int | None = Field(default=None, ge=0)
    half_day_late_cutoff_minutes: int | None = Field(default=None, ge=0)
    absent_late_cutoff_minutes: int | None = Field(default=None, ge=0)

    ot_minimum_minutes: int | None = Field(default=None, ge=0)
    ot_multiplier: Decimal | None = Field(default=None, ge=0)
    extra_hours_amount: Decimal | None = Field(default=None, ge=0)
    extra_hours_amount_unit: Literal["MINUTE", "HOUR", "DAY"] | None = None
    max_ot_minutes_per_day: int | None = Field(default=None, ge=0)

    in_out_rule: Literal["FIRST_IN_LAST_OUT", "ALL_IN_OUT"] | None = None

    allow_wfh: bool | None = None
    wfh_auto_approval_enabled: bool | None = None
    wfh_monthly_auto_quota: int | None = Field(default=None, ge=0)
    allow_overtime: bool | None = None
    overtime_auto_approval_enabled: bool | None = None
    allow_wfh_overtime: bool | None = None
    wfh_ot_requires_approval: bool | None = None
    ot_approval_mode: Literal[
        "ALWAYS_REQUIRE_APPROVAL",
        "AUTO_APPROVE_ALL",
        "AUTO_APPROVE_BELOW_THRESHOLD",
        "WFH_ONLY",
        "THRESHOLD_BASED",
        "DISABLED",
    ] | None = None
    ot_auto_approve_threshold_minutes: int | None = Field(default=None, ge=0)
    max_free_lates_per_month: int | None = Field(default=None, ge=0)
    late_penalty_action: Literal["WARNING", "DEDUCT_LEAVE_HALF_DAY", "LOSS_OF_PAY"] | None = None
    late_penalty_leave_type_id: UUID | None = None


class PolicyOut(PolicyBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class PolicyOverrideCreate(BaseModel):
    policy_id: UUID | None = None
    scope_type: Literal["EMPLOYEE", "DEPARTMENT", "DESIGNATION"]
    scope_id: UUID
    allow_wfh: bool | None = None
    wfh_monthly_quota: int | None = Field(default=None, ge=0)
    wfh_quota_mode: Literal["ABSOLUTE", "ADDITIVE"] = "ABSOLUTE"
    allow_overtime: bool | None = None
    ot_approval_mode: Literal[
        "ALWAYS_REQUIRE_APPROVAL",
        "AUTO_APPROVE_ALL",
        "AUTO_APPROVE_BELOW_THRESHOLD",
        "DISABLED",
    ] | None = None
    allow_wfh_overtime: bool | None = None
    wfh_ot_requires_approval: bool | None = None
    is_active: bool = True


class PolicyOverrideUpdate(BaseModel):
    policy_id: UUID | None = None
    allow_wfh: bool | None = None
    wfh_monthly_quota: int | None = Field(default=None, ge=0)
    wfh_quota_mode: Literal["ABSOLUTE", "ADDITIVE"] | None = None
    allow_overtime: bool | None = None
    ot_approval_mode: Literal[
        "ALWAYS_REQUIRE_APPROVAL",
        "AUTO_APPROVE_ALL",
        "AUTO_APPROVE_BELOW_THRESHOLD",
        "DISABLED",
    ] | None = None
    allow_wfh_overtime: bool | None = None
    wfh_ot_requires_approval: bool | None = None
    is_active: bool | None = None


class PolicyOverrideOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    policy_id: UUID | None = None
    scope_type: str
    scope_id: UUID
    allow_wfh: bool | None = None
    wfh_monthly_quota: int | None = None
    wfh_quota_mode: str = "ABSOLUTE"
    allow_overtime: bool | None = None
    ot_approval_mode: str | None = None
    allow_wfh_overtime: bool | None = None
    wfh_ot_requires_approval: bool | None = None
    is_active: bool = True
    created_at: datetime
    updated_at: datetime


class EffectivePolicyConfig(BaseModel):
    employee_id: UUID
    effective_allow_wfh: bool
    effective_wfh_auto_approval_enabled: bool
    effective_wfh_quota: int
    effective_allow_overtime: bool
    effective_overtime_auto_approval_enabled: bool
    effective_ot_approval_mode: str
    effective_allow_wfh_overtime: bool
    effective_wfh_ot_requires_approval: bool
    sources: dict[str, str] = Field(default_factory=dict)

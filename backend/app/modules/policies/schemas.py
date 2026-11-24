from datetime import datetime
from decimal import Decimal
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class PolicyBase(BaseModel):
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=120)
    description: str | None = Field(default=None, max_length=1000)
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

    # Overtime Controls
    ot_minimum_minutes: int = Field(default=30, ge=0)
    ot_multiplier: Decimal = Field(default=Decimal("1.50"), ge=Decimal("1.00"), le=Decimal("5.00"))
    max_ot_minutes_per_day: int | None = Field(default=None, ge=0)

    # Punch Rules
    in_out_rule: Literal["FIRST_IN_LAST_OUT", "ALL_IN_OUT"] = "FIRST_IN_LAST_OUT"

    # Work Modes & Mode-Gated Controls
    wfh_monthly_auto_quota: int = Field(default=4, ge=0)
    allow_wfh_overtime: bool = False
    ot_approval_mode: Literal["ALWAYS_REQUIRE_APPROVAL"] = "ALWAYS_REQUIRE_APPROVAL"
    max_free_lates_per_month: int = Field(default=3, ge=0)
    late_penalty_action: Literal["WARNING", "DEDUCT_LEAVE_HALF_DAY", "LOSS_OF_PAY"] = "WARNING"


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
    ot_multiplier: Decimal | None = Field(default=None, ge=Decimal("1.00"), le=Decimal("5.00"))
    max_ot_minutes_per_day: int | None = Field(default=None, ge=0)

    in_out_rule: Literal["FIRST_IN_LAST_OUT", "ALL_IN_OUT"] | None = None

    wfh_monthly_auto_quota: int | None = Field(default=None, ge=0)
    allow_wfh_overtime: bool | None = None
    ot_approval_mode: Literal["ALWAYS_REQUIRE_APPROVAL"] | None = None
    max_free_lates_per_month: int | None = Field(default=None, ge=0)
    late_penalty_action: Literal["WARNING", "DEDUCT_LEAVE_HALF_DAY", "LOSS_OF_PAY"] | None = None


class PolicyOut(PolicyBase):
    id: UUID
    tenant_id: UUID
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


class RosterDayMapping(BaseModel):
    day_index: int = Field(ge=0)
    shift_template_id: UUID | None = None
    is_rest_day: bool = False


class RosterPatternCreate(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=200)
    cycle_length_days: int = Field(default=7, ge=1, le=90)
    cycle_anchor_date: date
    day_shift_mapping: list[RosterDayMapping] = Field(min_length=1)


class RosterPatternRead(BaseModel):
    id: UUID
    tenant_id: UUID
    code: str
    name: str
    cycle_length_days: int
    cycle_anchor_date: date
    day_shift_mapping: list[dict[str, Any]]
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)


class MaterializeRosterRequest(BaseModel):
    employee_ids: list[UUID] = Field(min_length=1)
    start_date: date
    days: int = Field(default=30, ge=1, le=90)  # ADR-15: 30-day forward horizon
    shift_template_id: UUID | None = None
    roster_pattern_id: UUID | None = None
    rest_weekdays: list[int] | None = Field(
        default=None,
        description="Optional Python weekdays (0=Mon..6=Sun) to mark as REST_DAY when assigning a fixed shift_template_id.",
    )

    @model_validator(mode="after")
    def validate_source_exclusivity(self) -> "MaterializeRosterRequest":
        if self.shift_template_id and self.roster_pattern_id:
            raise ValueError("Provide either shift_template_id or roster_pattern_id, not both.")
        if not self.shift_template_id and not self.roster_pattern_id:
            raise ValueError("Either shift_template_id or roster_pattern_id must be provided.")
        if self.rest_weekdays is not None and any(d < 0 or d > 6 for d in self.rest_weekdays):
            raise ValueError("rest_weekdays values must be between 0 (Monday) and 6 (Sunday).")
        return self


class MaterializeRosterResponse(BaseModel):
    total_materialized: int
    employees_count: int
    start_date: date
    end_date: date


class AdHocOverrideRequest(BaseModel):
    shift_template_id: UUID | None = None
    is_rest_day: bool = False
    reason: str = Field(min_length=3, max_length=255)  # N67: Mandatory reason


class CancelShiftRequest(BaseModel):
    reason: str = Field(min_length=3, max_length=255)  # N66d: employer cancellation reason


class DatedShiftInstanceRead(BaseModel):
    id: UUID
    tenant_id: UUID
    employee_id: UUID
    calendar_date: date
    shift_template_id: UUID | None
    roster_pattern_id: UUID | None
    status: str
    resolution_mode: str
    sessions: list[dict[str, Any]]
    is_rest_day: bool
    is_adhoc_modified: bool
    modified_by_user_id: UUID | None
    modification_reason: str | None
    modified_at: datetime | None
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)

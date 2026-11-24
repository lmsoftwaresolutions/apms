from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class WorkModeApply(BaseModel):
    employee_id: UUID | None = None
    work_mode: Literal["WFH", "ON_DUTY"]
    calendar_date: date
    session_target: Literal["FULL", "FIRST_HALF", "SECOND_HALF"] = "FULL"
    reason: str = Field(min_length=3, max_length=1000)


class WorkModeReview(BaseModel):
    decision_reason: str | None = Field(default=None, max_length=1000)


class WorkModeOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    employee_id: UUID
    work_mode: str
    calendar_date: date
    session_target: str
    reason: str
    status: str
    is_auto_approved: bool
    approver_user_id: UUID | None = None
    decision_reason: str | None = None
    created_at: datetime
    updated_at: datetime

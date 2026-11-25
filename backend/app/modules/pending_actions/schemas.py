from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class PendingActionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

    id: UUID
    tenant_id: UUID
    action_type: str
    subject_type: str
    subject_id: UUID
    due_date: date
    status: str
    priority: str
    title: str
    description: str | None = None
    metadata_json: dict[str, Any] = Field(default_factory=dict, serialization_alias="metadata")
    resolution: dict[str, Any] | None = None
    resolved_by: UUID | None = None
    resolved_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    days_remaining: int | None = None


class PendingActionResolveInput(BaseModel):
    action: str  # 'CONFIRM', 'EXTEND', 'DISMISS'
    note: str | None = None
    target_employment_type: str | None = "FULL_TIME"
    target_department_id: UUID | None = None
    target_designation_id: UUID | None = None
    new_end_date: date | None = None


class PendingActionCountOut(BaseModel):
    pending: int
    overdue: int
    due_soon: int

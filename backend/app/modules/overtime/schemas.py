from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class OvertimeApproveRequest(BaseModel):
    approved_minutes: int = Field(ge=1)
    decision_reason: str | None = None


class OvertimeConvertCompOffRequest(BaseModel):
    decision_reason: str | None = None


class OvertimeRejectRequest(BaseModel):
    decision_reason: str = Field(min_length=1, max_length=1000)


class OvertimeRecordOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    tenant_id: UUID
    attendance_record_id: UUID
    employee_id: UUID
    overtime_date: date
    raw_overtime_minutes: int
    approved_overtime_minutes: int
    rate_multiplier: Decimal
    status: str
    comp_off_leave_transaction_id: UUID | None = None
    supervisor_id: UUID | None = None
    decision_reason: str | None = None
    reviewed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    quarterly_ot_minutes_used: int | None = None
    quarterly_ot_cap_minutes: int | None = None

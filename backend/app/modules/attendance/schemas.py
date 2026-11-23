from datetime import date, datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class DailyAttendanceRead(BaseModel):
    id: UUID
    tenant_id: UUID
    employee_id: UUID
    calendar_date: date
    dated_shift_instance_id: UUID | None = None
    status: str
    worked_duration_minutes: int
    scheduled_duration_minutes: int
    worked_ratio: float
    late_minutes: int
    early_departure_minutes: int
    overtime_minutes: int
    is_single_punch: bool
    anomaly_code: str | None = None
    created_at: datetime
    updated_at: datetime


class AttendanceTraceRead(BaseModel):
    id: UUID
    tenant_id: UUID
    attendance_record_id: UUID
    employee_id: UUID
    calendar_date: date
    trace_payload: dict[str, Any]
    evaluated_at: datetime


class RecalculateAttendanceRequest(BaseModel):
    employee_id: UUID
    calendar_date: date

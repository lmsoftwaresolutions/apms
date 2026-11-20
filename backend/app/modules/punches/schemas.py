from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, Field


class PunchIngestRequest(BaseModel):
    source: str = Field(min_length=1, max_length=50)  # ETIMEOFFICE, ZKTECO, CSV_BULK, MOBILE_GEO, MANUAL
    device_identifier: str | None = Field(default=None, max_length=100)
    raw_payload: dict[str, Any] | str | bytes


class PunchEventRead(BaseModel):
    id: UUID
    tenant_id: UUID
    raw_envelope_id: UUID
    employee_id: UUID
    punch_time: datetime
    punch_direction: str
    source: str
    status: str
    location_meta: dict[str, Any] | None = None
    created_at: datetime


class PunchIngestResult(BaseModel):
    raw_envelope_id: UUID
    source: str
    total_received: int
    active_punches: int
    duplicates_ignored: int
    unmatched_employees: list[str] = Field(default_factory=list)
    is_duplicate: bool = False

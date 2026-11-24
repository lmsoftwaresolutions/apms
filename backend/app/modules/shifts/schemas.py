from datetime import datetime, time
from decimal import Decimal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class ShiftSessionBase(BaseModel):
    session_order: int = Field(default=1, ge=1)
    name: str = Field(default="Session", max_length=100)
    start_time: time
    end_time: time
    pre_window_minutes: int = Field(default=60, ge=0)
    post_window_minutes: int = Field(default=120, ge=0)
    grace_period_late_minutes: int = Field(default=15, ge=0)
    grace_period_early_minutes: int = Field(default=15, ge=0)
    min_presence_ratio: Decimal = Field(default=Decimal("0.50"), ge=0, le=1)
    break_duration_minutes: int = Field(default=0, ge=0)


class ShiftSessionCreate(ShiftSessionBase):
    pass


class ShiftSessionRead(ShiftSessionBase):
    id: UUID
    is_overnight: bool

    model_config = ConfigDict(from_attributes=True)


class ShiftTemplateBase(BaseModel):
    code: str = Field(min_length=2, max_length=50, pattern=r"^[A-Z0-9_-]+$")
    name: str = Field(min_length=1, max_length=200)
    shift_type: str = Field(default="FIXED")  # FIXED, FLEXI, OVERNIGHT, SPLIT, CONTINUOUS
    color_code: str | None = Field(default=None, max_length=20)
    policy_id: UUID | None = None


class ShiftTemplateCreate(ShiftTemplateBase):
    sessions: list[ShiftSessionCreate] = Field(min_length=1)


class ShiftTemplateUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    is_active: bool | None = None
    color_code: str | None = None
    policy_id: UUID | None = None
    sessions: list[ShiftSessionCreate] | None = None


class ShiftTemplateRead(ShiftTemplateBase):
    id: UUID
    tenant_id: UUID
    is_overnight: bool
    is_active: bool
    created_at: datetime
    updated_at: datetime
    sessions: list[ShiftSessionRead] = []

    model_config = ConfigDict(from_attributes=True)


class ShiftTemplateListRead(ShiftTemplateBase):
    id: UUID
    tenant_id: UUID
    is_overnight: bool
    is_active: bool
    created_at: datetime
    session_count: int = 1

    model_config = ConfigDict(from_attributes=True)

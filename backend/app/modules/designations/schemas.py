from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import DeletedOut

__all__ = ["DesignationOut", "DesignationCreate", "DesignationUpdate", "DeletedOut"]


class DesignationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    department_id: UUID
    code: str
    name: str
    description: str | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DesignationCreate(BaseModel):
    department_id: UUID
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=30, pattern=r"^[A-Z0-9_-]+$")
    description: str | None = None


class DesignationUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=2, max_length=30, pattern=r"^[A-Z0-9_-]+$")
    description: str | None = None
    is_active: bool | None = None


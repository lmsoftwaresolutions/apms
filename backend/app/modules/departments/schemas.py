from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import DeletedOut

__all__ = ["DepartmentOut", "DepartmentCreate", "DepartmentUpdate", "DeletedOut"]


class DepartmentOut(BaseModel):
    id: UUID
    branch_id: UUID
    name: str
    code: str
    parent_dept_id: UUID | None = None
    is_active: bool


class DepartmentCreate(BaseModel):
    branch_id: UUID
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    parent_dept_id: UUID | None = None


class DepartmentUpdate(BaseModel):
    branch_id: UUID | None = None
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    parent_dept_id: UUID | None = None
    is_active: bool | None = None


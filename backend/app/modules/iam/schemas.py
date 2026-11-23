from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import DeletedOut

__all__ = [
    "UserOut",
    "AssignmentIn",
    "PermissionOut",
    "RoleOut",
    "RoleCreate",
    "RoleUpdate",
    "DeletedOut",
]


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool
    roles: list[str]


class AssignmentIn(BaseModel):
    role_id: UUID


class RoleOut(BaseModel):
    id: UUID
    code: str
    name: str
    is_system: bool
    permissions: list[str]


class RoleCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40, pattern=r"^[A-Z][A-Z0-9_]*$")
    name: str = Field(min_length=1, max_length=120)
    permissions: list[str] = Field(default_factory=list)


class RoleUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=120)
    permissions: list[str] | None = None


class PermissionOut(BaseModel):
    code: str
    module: str
    resource: str
    action: str
    description: str

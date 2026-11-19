from uuid import UUID

from pydantic import BaseModel, Field


class TokenOut(BaseModel):
    access_token: str
    token_type: str = "bearer"


class LoginIn(BaseModel):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=8, max_length=200)


class TenantOut(BaseModel):
    id: UUID
    display_name: str
    logo_url: str | None


class TenantUpdate(BaseModel):
    display_name: str | None = Field(default=None, min_length=1, max_length=200)
    logo_url: str | None = Field(default=None, max_length=500)


class MeOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    tenant: TenantOut
    permissions: list[str]


class PermissionOut(BaseModel):
    code: str
    module: str
    resource: str
    action: str
    description: str


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


class UserOut(BaseModel):
    id: UUID
    email: str
    full_name: str
    is_active: bool
    roles: list[str]


class AssignmentIn(BaseModel):
    role_id: UUID


class BranchOut(BaseModel):
    id: UUID
    name: str
    code: str
    is_active: bool


class BranchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    is_active: bool | None = None


class DeletedOut(BaseModel):
    id: UUID
    deleted: bool = True

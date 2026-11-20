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

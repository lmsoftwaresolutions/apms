from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field


class TenantListItem(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    subdomain: str
    display_name: str
    logo_url: str | None = None
    is_active: bool
    created_at: datetime
    employee_count: int = 0
    branch_count: int = 0


class TenantProvisionRequest(BaseModel):
    name: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9_-]+$")
    subdomain: str = Field(min_length=2, max_length=100, pattern=r"^[a-z0-9_-]+$")
    display_name: str = Field(min_length=2, max_length=200)
    admin_email: str = Field(min_length=5, max_length=255)
    admin_full_name: str = Field(min_length=2, max_length=200)
    admin_password: str = Field(min_length=8, max_length=128)
    branch_name: str = Field(default="Headquarters", max_length=200)
    branch_code: str = Field(default="HQ", max_length=20)


class TenantStatusUpdate(BaseModel):
    is_active: bool

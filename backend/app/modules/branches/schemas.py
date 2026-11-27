from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import DeletedOut

__all__ = ["BranchOut", "BranchCreate", "BranchUpdate", "DeletedOut"]


class BranchOut(BaseModel):
    id: UUID
    name: str
    code: str
    registration_number: str | None
    geofence_latitude: float | None = None
    geofence_longitude: float | None = None
    geofence_radius_m: int | None = None
    allowed_bssids: list[str] | None = None
    is_active: bool


class BranchCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    code: str = Field(min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    registration_number: str | None = Field(default=None, min_length=1, max_length=80)
    geofence_latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    geofence_longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    geofence_radius_m: int | None = Field(default=None, ge=10, le=50000)
    allowed_bssids: list[str] | None = None


class BranchUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    code: str | None = Field(default=None, min_length=2, max_length=20, pattern=r"^[A-Z0-9_-]+$")
    registration_number: str | None = Field(default=None, min_length=1, max_length=80)
    geofence_latitude: float | None = Field(default=None, ge=-90.0, le=90.0)
    geofence_longitude: float | None = Field(default=None, ge=-180.0, le=180.0)
    geofence_radius_m: int | None = Field(default=None, ge=10, le=50000)
    allowed_bssids: list[str] | None = None
    is_active: bool | None = None

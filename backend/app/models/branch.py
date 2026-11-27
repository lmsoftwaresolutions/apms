from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Branch(Base):
    __tablename__ = "branches"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_branches_tenant_id"),
        UniqueConstraint("tenant_id", "code", name="uq_branches_tenant_code"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    name: Mapped[str]
    code: Mapped[str]
    registration_number: Mapped[str | None] = mapped_column(default=None)
    geofence_latitude: Mapped[float | None] = mapped_column(default=None)
    geofence_longitude: Mapped[float | None] = mapped_column(default=None)
    geofence_radius_m: Mapped[int | None] = mapped_column(default=None)
    allowed_bssids: Mapped[list[str] | None] = mapped_column(JSONB, default=None)
    is_active: Mapped[bool]
    created_at: Mapped[datetime]

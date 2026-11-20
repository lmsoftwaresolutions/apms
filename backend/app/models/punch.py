from datetime import datetime
from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RawEnvelope(Base):
    __tablename__ = "raw_envelope"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_raw_envelope_tenant_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    source: Mapped[str]
    device_identifier: Mapped[str | None] = mapped_column(default=None)
    raw_payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    payload_hash: Mapped[str]
    received_at: Mapped[datetime]


class PunchEvent(Base):
    __tablename__ = "punch_event"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_punch_event_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_punch_employee",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "raw_envelope_id"],
            ["raw_envelope.tenant_id", "raw_envelope.id"],
            name="fk_punch_envelope",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    raw_envelope_id: Mapped[UUID]
    employee_id: Mapped[UUID]
    punch_time: Mapped[datetime]
    punch_direction: Mapped[str] = mapped_column(default="UNKNOWN")
    source: Mapped[str]
    status: Mapped[str] = mapped_column(default="ACTIVE")
    location_meta: Mapped[dict[str, Any] | None] = mapped_column(JSONB, default=None)
    created_at: Mapped[datetime]

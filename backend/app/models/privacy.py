from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class ConsentEvent(Base):
    __tablename__ = "consent_events"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_consent_events_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_consent_employee",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    action: Mapped[str]
    purpose: Mapped[str]
    retention: Mapped[str]
    actor_user_id: Mapped[UUID | None] = mapped_column(default=None)
    recorded_at: Mapped[datetime]


class PiiAccessAudit(Base):
    __tablename__ = "pii_access_audits"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_pii_access_audits_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_pii_audit_employee",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    actor_user_id: Mapped[UUID]
    field_name: Mapped[str]
    accessed_at: Mapped[datetime]

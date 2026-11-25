from datetime import date, datetime
from uuid import UUID, uuid4

from sqlalchemy import Date, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class PendingAction(Base):
    __tablename__ = "pending_actions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_pending_actions_tenant_id"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True, default=uuid4)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    action_type: Mapped[str] = mapped_column(String(50))  # 'PROBATION_EXPIRY', 'CONFIRMATION_DUE'
    subject_type: Mapped[str] = mapped_column(String(50))  # 'EMPLOYEE'
    subject_id: Mapped[UUID] = mapped_column()
    due_date: Mapped[date] = mapped_column(Date)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")  # 'PENDING', 'RESOLVED', 'DISMISSED'
    priority: Mapped[str] = mapped_column(String(20), default="MEDIUM")  # 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    metadata_json: Mapped[dict] = mapped_column("metadata", JSONB, default=dict)
    resolution: Mapped[dict | None] = mapped_column(JSONB, default=None)
    resolved_by: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), default=None)
    resolved_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime] = mapped_column(default=datetime.now)
    updated_at: Mapped[datetime] = mapped_column(default=datetime.now, onupdate=datetime.now)

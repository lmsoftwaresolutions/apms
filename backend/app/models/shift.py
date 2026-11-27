from datetime import datetime, time
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Numeric, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.policy import PolicyMaster


class ShiftTemplate(Base):
    __tablename__ = "shift_templates"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_shift_templates_tenant_id"),
        UniqueConstraint("tenant_id", "code", name="uq_shift_templates_tenant_code"),
        ForeignKeyConstraint(
            ["tenant_id", "policy_id"],
            ["policy_master.tenant_id", "policy_master.id"],
            name="fk_shift_template_policy",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    policy_id: Mapped[UUID | None] = mapped_column(default=None)
    code: Mapped[str]
    name: Mapped[str]
    shift_type: Mapped[str] = mapped_column(default="FIXED")  # FIXED, FLEXI, OVERNIGHT, SPLIT, CONTINUOUS
    is_overnight: Mapped[bool] = mapped_column(default=False)
    continuous_duty_hours: Mapped[int | None] = mapped_column(default=None)
    is_active: Mapped[bool] = mapped_column(default=True)
    color_code: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    policy: Mapped["PolicyMaster | None"] = relationship(
        back_populates="shift_templates",
        lazy="selectin",
    )

    sessions: Mapped[list["ShiftSession"]] = relationship(
        back_populates="shift_template",
        cascade="all, delete-orphan",
        order_by="ShiftSession.session_order",
        lazy="selectin",
    )


class ShiftSession(Base):
    __tablename__ = "shift_sessions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_shift_sessions_tenant_id"),
        UniqueConstraint("tenant_id", "shift_template_id", "session_order", name="uq_shift_sessions_template_order"),
        ForeignKeyConstraint(
            ["tenant_id", "shift_template_id"],
            ["shift_templates.tenant_id", "shift_templates.id"],
            name="fk_shift_session_template",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    shift_template_id: Mapped[UUID]
    session_order: Mapped[int] = mapped_column(default=1)
    name: Mapped[str] = mapped_column(default="Session")
    start_time: Mapped[time]
    end_time: Mapped[time]
    pre_window_minutes: Mapped[int] = mapped_column(default=60)
    post_window_minutes: Mapped[int] = mapped_column(default=120)
    grace_period_late_minutes: Mapped[int] = mapped_column(default=15)
    grace_period_early_minutes: Mapped[int] = mapped_column(default=15)
    min_presence_ratio: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("0.50"))
    break_duration_minutes: Mapped[int] = mapped_column(default=0)
    is_overnight: Mapped[bool] = mapped_column(default=False)
    created_at: Mapped[datetime]

    shift_template: Mapped[ShiftTemplate] = relationship(back_populates="sessions")

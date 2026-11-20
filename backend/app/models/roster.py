from datetime import date, datetime
from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class RosterPattern(Base):
    __tablename__ = "roster_patterns"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_roster_patterns_tenant_id"),
        UniqueConstraint("tenant_id", "code", name="uq_roster_patterns_tenant_code"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    code: Mapped[str]
    name: Mapped[str]
    cycle_length_days: Mapped[int] = mapped_column(default=7)
    day_shift_mapping: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class DatedShiftInstance(Base):
    __tablename__ = "dated_shift_instances"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_dated_shift_instances_tenant_id"),
        UniqueConstraint("tenant_id", "employee_id", "calendar_date", name="uq_dated_shift_instance_emp_date"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_dated_shift_employee",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "shift_template_id"],
            ["shift_templates.tenant_id", "shift_templates.id"],
            name="fk_dated_shift_template",
            ondelete="SET NULL",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "roster_pattern_id"],
            ["roster_patterns.tenant_id", "roster_patterns.id"],
            name="fk_dated_shift_pattern",
            ondelete="SET NULL",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    calendar_date: Mapped[date]
    shift_template_id: Mapped[UUID | None] = mapped_column(default=None)
    roster_pattern_id: Mapped[UUID | None] = mapped_column(default=None)
    status: Mapped[str] = mapped_column(default="SCHEDULED")  # SCHEDULED, CANCELLED_PAID, REST_DAY
    resolution_mode: Mapped[str] = mapped_column(default="ROSTER_PATTERN")  # ROSTER_PATTERN, DIRECT_ASSIGNMENT, ADHOC_OVERRIDE, MANUAL
    sessions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list)
    is_rest_day: Mapped[bool] = mapped_column(default=False)
    is_adhoc_modified: Mapped[bool] = mapped_column(default=False)
    modified_by_user_id: Mapped[UUID | None] = mapped_column(default=None)
    modification_reason: Mapped[str | None] = mapped_column(default=None)
    modified_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

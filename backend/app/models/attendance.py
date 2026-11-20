from datetime import date, datetime
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, Numeric, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AttendanceDailyRecord(Base):
    __tablename__ = "attendance_daily_records"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_attendance_daily_record_id"),
        UniqueConstraint("tenant_id", "employee_id", "calendar_date", name="uq_attendance_employee_date"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_attendance_employee",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "dated_shift_instance_id"],
            ["dated_shift_instances.tenant_id", "dated_shift_instances.id"],
            name="fk_attendance_dated_shift_instance",
            ondelete="SET NULL",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    calendar_date: Mapped[date]
    dated_shift_instance_id: Mapped[UUID | None] = mapped_column(default=None)
    status: Mapped[str]
    worked_duration_minutes: Mapped[int] = mapped_column(default=0)
    scheduled_duration_minutes: Mapped[int] = mapped_column(default=0)
    worked_ratio: Mapped[Decimal] = mapped_column(Numeric(5, 4), default=Decimal("0.0"))
    late_minutes: Mapped[int] = mapped_column(default=0)
    early_departure_minutes: Mapped[int] = mapped_column(default=0)
    overtime_minutes: Mapped[int] = mapped_column(default=0)
    is_single_punch: Mapped[bool] = mapped_column(default=False)
    anomaly_code: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class AttendanceExplanationTrace(Base):
    __tablename__ = "attendance_explanation_traces"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_attendance_trace_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "attendance_record_id"],
            ["attendance_daily_records.tenant_id", "attendance_daily_records.id"],
            name="fk_attendance_trace_record",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    attendance_record_id: Mapped[UUID]
    employee_id: Mapped[UUID]
    calendar_date: Mapped[date]
    trace_payload: Mapped[dict[str, Any]] = mapped_column(JSONB)
    evaluated_at: Mapped[datetime]

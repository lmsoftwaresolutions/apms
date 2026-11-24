from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING
from uuid import UUID

from sqlalchemy import (
    Boolean,
    Date,
    ForeignKey,
    ForeignKeyConstraint,
    Integer,
    Numeric,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base

if TYPE_CHECKING:
    from app.models.attendance import AttendanceDailyRecord
    from app.models.employee import Employee
    from app.models.leave import LeaveTransaction
    from app.models.iam import User


class StatutoryOTCap(Base):
    __tablename__ = "statutory_ot_caps"
    __table_args__ = (
        UniqueConstraint("state_code", "effective_from", name="uq_statutory_ot_caps_state_eff"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    state_code: Mapped[str] = mapped_column(String(10))
    quarterly_cap_hours: Mapped[int] = mapped_column(Integer, default=125)
    daily_cap_hours: Mapped[int | None] = mapped_column(Integer, default=4)
    effective_from: Mapped[date] = mapped_column(Date)
    effective_to: Mapped[date | None] = mapped_column(Date, default=None)
    created_at: Mapped[datetime]


class OvertimeRecord(Base):
    __tablename__ = "overtime_records"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_overtime_records_tenant_id"),
        UniqueConstraint("tenant_id", "attendance_record_id", name="uq_overtime_records_tenant_att"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_overtime_records_employee",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    attendance_record_id: Mapped[UUID] = mapped_column(
        ForeignKey("attendance_daily_records.id", ondelete="CASCADE")
    )
    employee_id: Mapped[UUID]
    overtime_date: Mapped[date] = mapped_column(Date)
    raw_overtime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    approved_overtime_minutes: Mapped[int] = mapped_column(Integer, default=0)
    rate_multiplier: Mapped[Decimal] = mapped_column(Numeric(3, 2), default=Decimal("2.00"))
    status: Mapped[str] = mapped_column(String(30), default="UNREVIEWED")
    comp_off_leave_transaction_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("leave_transactions.id", ondelete="SET NULL"), default=None
    )
    supervisor_id: Mapped[UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), default=None
    )
    decision_reason: Mapped[str | None] = mapped_column(Text, default=None)
    reviewed_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

    attendance_record: Mapped["AttendanceDailyRecord"] = relationship()
    employee: Mapped["Employee"] = relationship()

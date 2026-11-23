from datetime import date, datetime
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AttendanceRollupFailure(Base):
    __tablename__ = "attendance_rollup_failures"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_attendance_rollup_failures_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_rollup_failure_employee",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    calendar_date: Mapped[date]
    error_title: Mapped[str]
    error_detail: Mapped[str]
    created_at: Mapped[datetime]

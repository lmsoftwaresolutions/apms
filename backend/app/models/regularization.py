from datetime import date, datetime
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class AttendanceRegularization(Base):
    __tablename__ = "attendance_regularizations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_attendance_regularizations_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_regularization_employee",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    calendar_date: Mapped[date]
    request_type: Mapped[str]
    requested_in: Mapped[datetime | None] = mapped_column(default=None)
    requested_out: Mapped[datetime | None] = mapped_column(default=None)
    reason: Mapped[str]
    status: Mapped[str] = mapped_column(default="PENDING")
    approver_user_id: Mapped[UUID | None] = mapped_column(default=None)
    approver_comment: Mapped[str | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, ForeignKeyConstraint, Index, String, Text, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class WorkModeRequest(Base):
    __tablename__ = "work_mode_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_work_mode_requests_tenant_id"),
        Index(
            "uq_work_mode_open_emp_date_session",
            "tenant_id",
            "employee_id",
            "calendar_date",
            "session_target",
            unique=True,
            postgresql_where=text("status <> 'REJECTED'"),
        ),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_work_mode_employee",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    work_mode: Mapped[str] = mapped_column(String(20))  # WFH, ON_DUTY
    calendar_date: Mapped[date]
    session_target: Mapped[str] = mapped_column(String(20), default="FULL")  # FULL, FIRST_HALF, SECOND_HALF
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")  # PENDING, APPROVED, REJECTED
    is_auto_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    approver_user_id: Mapped[UUID | None] = mapped_column(ForeignKey("users.id"), default=None)
    decision_reason: Mapped[str | None] = mapped_column(Text, default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

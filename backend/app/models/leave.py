from datetime import date, datetime
from decimal import Decimal
from uuid import UUID

from sqlalchemy import Boolean, ForeignKey, ForeignKeyConstraint, Numeric, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class LeaveType(Base):
    __tablename__ = "leave_types"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_leave_types_tenant_id"),
        UniqueConstraint("tenant_id", "code", name="uq_leave_types_tenant_code"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(120))
    allow_negative_balance: Mapped[bool] = mapped_column(Boolean, default=False)
    sandwich_enabled: Mapped[bool] = mapped_column(Boolean, default=False)


class Holiday(Base):
    __tablename__ = "holidays"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_holidays_tenant_id"),
        UniqueConstraint("tenant_id", "branch_id", "calendar_date", name="uq_holidays_branch_date"),
        ForeignKeyConstraint(
            ["tenant_id", "branch_id"],
            ["branches.tenant_id", "branches.id"],
            name="fk_holidays_branch",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    branch_id: Mapped[UUID]
    calendar_date: Mapped[date]
    name: Mapped[str] = mapped_column(String(160))


class LeaveRequest(Base):
    __tablename__ = "leave_requests"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_leave_requests_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_leave_request_employee",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "leave_type_id"],
            ["leave_types.tenant_id", "leave_types.id"],
            name="fk_leave_request_type",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    leave_type_id: Mapped[UUID]
    start_date: Mapped[date]
    end_date: Mapped[date]
    portion: Mapped[str] = mapped_column(String(20))
    days: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    reason: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(20), default="PENDING")
    approver_user_id: Mapped[UUID | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]


class LeaveTransaction(Base):
    __tablename__ = "leave_transactions"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_leave_transactions_tenant_id"),
        ForeignKeyConstraint(
            ["tenant_id", "employee_id"],
            ["employees.tenant_id", "employees.id"],
            name="fk_leave_txn_employee",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "leave_type_id"],
            ["leave_types.tenant_id", "leave_types.id"],
            name="fk_leave_txn_type",
            ondelete="RESTRICT",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "request_id"],
            ["leave_requests.tenant_id", "leave_requests.id"],
            name="fk_leave_txn_request",
            ondelete="RESTRICT",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    employee_id: Mapped[UUID]
    leave_type_id: Mapped[UUID]
    request_id: Mapped[UUID | None] = mapped_column(default=None)
    calendar_date: Mapped[date | None] = mapped_column(default=None)
    entry_type: Mapped[str] = mapped_column(String(20))
    days: Mapped[Decimal] = mapped_column(Numeric(6, 1))
    session_target: Mapped[str | None] = mapped_column(String(20), default=None)
    created_at: Mapped[datetime]

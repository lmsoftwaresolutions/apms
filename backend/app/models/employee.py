from datetime import date, datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
    CHAR,
    Date,
    DateTime,
    ForeignKey,
    ForeignKeyConstraint,
    Index,
    String,
    Text,
    UniqueConstraint,
    text,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Employee(Base):
    __tablename__ = "employees"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_employees_tenant_id"),
        UniqueConstraint("tenant_id", "employee_code", name="uq_employees_tenant_code"),
        UniqueConstraint("tenant_id", "user_id", name="uq_employees_tenant_user"),
        ForeignKeyConstraint(
            ["tenant_id", "branch_id"],
            ["branches.tenant_id", "branches.id"],
            name="fk_employees_branch",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "department_id"],
            ["departments.tenant_id", "departments.id"],
            name="fk_employees_department",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "user_id"],
            ["users.tenant_id", "users.id"],
            name="fk_employees_user",
        ),
        Index(
            "uq_employees_tenant_pan",
            "tenant_id",
            "pan_fingerprint",
            unique=True,
            postgresql_where=text("pan_fingerprint IS NOT NULL"),
        ),
        Index(
            "uq_employees_tenant_aadhaar",
            "tenant_id",
            "aadhaar_fingerprint",
            unique=True,
            postgresql_where=text("aadhaar_fingerprint IS NOT NULL"),
        ),
        Index(
            "uq_employees_tenant_uan",
            "tenant_id",
            "epf_uan_fingerprint",
            unique=True,
            postgresql_where=text("epf_uan_fingerprint IS NOT NULL"),
        ),
        Index(
            "uq_employees_tenant_esic",
            "tenant_id",
            "esic_number_fingerprint",
            unique=True,
            postgresql_where=text("esic_number_fingerprint IS NOT NULL"),
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    user_id: Mapped[UUID | None] = mapped_column(default=None)
    branch_id: Mapped[UUID]
    department_id: Mapped[UUID | None] = mapped_column(default=None)
    employee_code: Mapped[str] = mapped_column(String(50))
    full_name: Mapped[str] = mapped_column(String(300))
    designation: Mapped[str | None] = mapped_column(String(200), default=None)
    date_of_joining: Mapped[date] = mapped_column(Date)
    date_of_birth: Mapped[date | None] = mapped_column(Date, default=None)
    employment_type: Mapped[str] = mapped_column(String(50), default="FULL_TIME")
    probation_end_date: Mapped[date | None] = mapped_column(Date, default=None)
    confirmation_date: Mapped[date | None] = mapped_column(Date, default=None)

    pan_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    pan_fingerprint: Mapped[str | None] = mapped_column(CHAR(64), default=None)
    aadhaar_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    aadhaar_fingerprint: Mapped[str | None] = mapped_column(CHAR(64), default=None)
    bank_account_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    bank_ifsc_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    epf_uan_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    epf_uan_fingerprint: Mapped[str | None] = mapped_column(CHAR(64), default=None)
    esic_number_encrypted: Mapped[str | None] = mapped_column(Text, default=None)
    esic_number_fingerprint: Mapped[str | None] = mapped_column(CHAR(64), default=None)

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    biometric_consent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))

from datetime import date, datetime
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
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
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    user_id: Mapped[UUID | None] = mapped_column(default=None)
    branch_id: Mapped[UUID]
    department_id: Mapped[UUID | None] = mapped_column(default=None)
    employee_code: Mapped[str]
    full_name: Mapped[str]
    designation: Mapped[str | None] = mapped_column(default=None)
    date_of_joining: Mapped[date]
    date_of_birth: Mapped[date | None] = mapped_column(default=None)
    employment_type: Mapped[str] = mapped_column(default="FULL_TIME")
    probation_end_date: Mapped[date | None] = mapped_column(default=None)
    confirmation_date: Mapped[date | None] = mapped_column(default=None)

    # Encrypted PII fields (SEC-02, EMP-02)
    pan_encrypted: Mapped[str | None] = mapped_column(default=None)
    aadhaar_encrypted: Mapped[str | None] = mapped_column(default=None)
    bank_account_encrypted: Mapped[str | None] = mapped_column(default=None)
    bank_ifsc_encrypted: Mapped[str | None] = mapped_column(default=None)

    # Statutory identifiers
    epf_uan: Mapped[str | None] = mapped_column(default=None)
    esic_number: Mapped[str | None] = mapped_column(default=None)

    is_active: Mapped[bool] = mapped_column(default=True)
    biometric_consent_at: Mapped[datetime | None] = mapped_column(default=None)
    created_at: Mapped[datetime]
    updated_at: Mapped[datetime]

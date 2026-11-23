from datetime import datetime
from uuid import UUID

from sqlalchemy import (
    Boolean,
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


class Designation(Base):
    __tablename__ = "designations"
    __table_args__ = (
        UniqueConstraint("tenant_id", "id", name="uq_designations_tenant_id"),
        UniqueConstraint("tenant_id", "department_id", "code", name="uq_designations_tenant_dept_code"),
        Index(
            "uq_designations_tenant_dept_name",
            "tenant_id",
            "department_id",
            text("lower(name)"),
            unique=True,
        ),
        ForeignKeyConstraint(
            ["tenant_id", "department_id"],
            ["departments.tenant_id", "departments.id"],
            name="fk_designations_department",
            ondelete="CASCADE",
        ),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    department_id: Mapped[UUID] = mapped_column()
    code: Mapped[str] = mapped_column(String(30))
    name: Mapped[str] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text, default=None)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


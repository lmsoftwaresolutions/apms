from datetime import datetime
from uuid import UUID

from sqlalchemy import ForeignKey, ForeignKeyConstraint, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base


class Department(Base):
    __tablename__ = "departments"
    __table_args__ = (
        ForeignKeyConstraint(
            ["tenant_id", "branch_id"],
            ["branches.tenant_id", "branches.id"],
            name="fk_departments_branch",
            ondelete="CASCADE",
        ),
        ForeignKeyConstraint(
            ["tenant_id", "parent_dept_id"],
            ["departments.tenant_id", "departments.id"],
            name="fk_departments_parent",
        ),
        UniqueConstraint("tenant_id", "id", name="uq_departments_tenant_id"),
        UniqueConstraint("tenant_id", "branch_id", "code", name="uq_departments_tenant_branch_code"),
    )

    id: Mapped[UUID] = mapped_column(primary_key=True)
    tenant_id: Mapped[UUID] = mapped_column(ForeignKey("tenants.id"))
    branch_id: Mapped[UUID] = mapped_column()
    name: Mapped[str]
    code: Mapped[str]
    parent_dept_id: Mapped[UUID | None] = mapped_column(default=None)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_at: Mapped[datetime]

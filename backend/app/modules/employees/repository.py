from collections.abc import Sequence
from datetime import UTC, datetime
from uuid import UUID

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee


async def insert_employee(session: AsyncSession, employee: Employee) -> Employee:
    session.add(employee)
    await session.flush()
    return employee


async def list_active_employee_ids(
    session: AsyncSession,
    tenant_id: UUID,
    employee_ids: Sequence[UUID],
) -> set[UUID]:
    if not employee_ids:
        return set()
    stmt = select(Employee.id).where(
        Employee.tenant_id == tenant_id,
        Employee.id.in_(list(employee_ids)),
        Employee.is_active.is_(True),
    )
    return set((await session.scalars(stmt)).all())


async def get_active_employee_id_by_code(
    session: AsyncSession,
    tenant_id: UUID,
    employee_code: str,
) -> UUID | None:
    stmt = select(Employee.id).where(
        Employee.tenant_id == tenant_id,
        Employee.employee_code == employee_code,
        Employee.is_active.is_(True),
    )
    return await session.scalar(stmt)


async def get_employee_by_id(session: AsyncSession, tenant_id: UUID, employee_id: UUID) -> Employee | None:
    emp = await session.get(Employee, employee_id)
    if emp is None or emp.tenant_id != tenant_id:
        return None
    return emp


async def list_employees_by_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID | None = None,
    department_id: UUID | None = None,
    is_active: bool | None = None,
) -> Sequence[Employee]:
    stmt = select(Employee).where(Employee.tenant_id == tenant_id)
    if branch_id is not None:
        stmt = stmt.where(Employee.branch_id == branch_id)
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    if is_active is not None:
        stmt = stmt.where(Employee.is_active == is_active)
    stmt = stmt.order_by(Employee.employee_code)

    return (await session.scalars(stmt)).all()


async def flush_employee(session: AsyncSession) -> None:
    await session.flush()


async def count_employees_with_designation(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
) -> int:
    count = await session.scalar(
        select(func.count(Employee.id)).where(
            Employee.tenant_id == tenant_id,
            Employee.designation_id == designation_id,
        )
    )
    return int(count or 0)


async def sync_designation_label(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
    name: str,
) -> None:
    stmt = (
        update(Employee)
        .where(Employee.tenant_id == tenant_id, Employee.designation_id == designation_id)
        .values(designation=name, updated_at=datetime.now(UTC))
        .execution_options(synchronize_session="fetch")
    )
    await session.execute(stmt)
    await session.flush()


async def delete_employee_record(session: AsyncSession, employee: Employee) -> None:
    await session.delete(employee)
    await session.flush()

from collections.abc import Sequence
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.department import Department
from app.models.employee import Employee
from app.models.iam import User


async def get_branch(session: AsyncSession, tenant_id: UUID, branch_id: UUID) -> Branch | None:
    branch = await session.get(Branch, branch_id)
    if branch is None or branch.tenant_id != tenant_id:
        return None
    return branch


async def get_department(session: AsyncSession, tenant_id: UUID, department_id: UUID) -> Department | None:
    dept = await session.get(Department, department_id)
    if dept is None or dept.tenant_id != tenant_id:
        return None
    return dept


async def get_user(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> User | None:
    user = await session.get(User, user_id)
    if user is None or user.tenant_id != tenant_id:
        return None
    return user


async def insert_employee(session: AsyncSession, employee: Employee) -> Employee:
    session.add(employee)
    await session.flush()
    return employee


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


async def delete_employee_record(session: AsyncSession, employee: Employee) -> None:
    await session.delete(employee)
    await session.flush()

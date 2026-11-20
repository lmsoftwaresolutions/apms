from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch
from app.models.department import Department


async def list_departments_by_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID | None = None,
) -> list[Department]:
    stmt = select(Department).where(Department.tenant_id == tenant_id)
    if branch_id is not None:
        stmt = stmt.where(Department.branch_id == branch_id)
    stmt = stmt.order_by(Department.code)
    return list((await session.scalars(stmt)).all())


async def get_department_by_id(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
) -> Department | None:
    dept = await session.get(Department, department_id)
    if dept is None or dept.tenant_id != tenant_id:
        return None
    return dept


async def insert_department(
    session: AsyncSession,
    department: Department,
) -> Department:
    session.add(department)
    await session.flush()
    return department


async def update_department_fields(
    session: AsyncSession,
    department: Department,
    *,
    branch_id: UUID | None = None,
    name: str | None = None,
    code: str | None = None,
    parent_dept_id: UUID | None = None,
    update_parent_dept_id: bool = False,
    is_active: bool | None = None,
) -> Department:
    if branch_id is not None:
        department.branch_id = branch_id
    if name is not None:
        department.name = name
    if code is not None:
        department.code = code
    if update_parent_dept_id:
        department.parent_dept_id = parent_dept_id
    if is_active is not None:
        department.is_active = is_active
    await session.flush()
    return department


async def delete_department_record(
    session: AsyncSession,
    department: Department,
) -> None:
    await session.delete(department)
    await session.flush()


async def has_sub_departments(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
) -> bool:
    sub = await session.scalar(
        select(Department.id)
        .where(Department.tenant_id == tenant_id, Department.parent_dept_id == department_id)
        .limit(1)
    )
    return sub is not None


async def branch_exists_in_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID,
) -> bool:
    result = await session.scalar(
        select(Branch.id).where(Branch.tenant_id == tenant_id, Branch.id == branch_id)
    )
    return result is not None


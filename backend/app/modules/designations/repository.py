from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.designation import Designation
from app.models.employee import Employee


async def list_designations_by_tenant(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID | None = None,
) -> list[Designation]:
    stmt = select(Designation).where(Designation.tenant_id == tenant_id)
    if department_id is not None:
        stmt = stmt.where(Designation.department_id == department_id)
    stmt = stmt.order_by(Designation.name)
    return list((await session.scalars(stmt)).all())


async def get_designation_by_id(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
) -> Designation | None:
    row = await session.get(Designation, designation_id)
    if row is None or row.tenant_id != tenant_id:
        return None
    return row


async def get_designation_by_code(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
    code: str,
) -> Designation | None:
    return await session.scalar(
        select(Designation).where(
            Designation.tenant_id == tenant_id,
            Designation.department_id == department_id,
            Designation.code == code,
        )
    )


async def get_designation_by_name(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
    name: str,
) -> Designation | None:
    return await session.scalar(
        select(Designation).where(
            Designation.tenant_id == tenant_id,
            Designation.department_id == department_id,
            func.lower(Designation.name) == name.strip().lower(),
        )
    )


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


async def insert_designation(
    session: AsyncSession,
    designation: Designation,
) -> Designation:
    session.add(designation)
    await session.flush()
    return designation


async def update_designation_fields(
    session: AsyncSession,
    designation: Designation,
    *,
    name: str | None = None,
    code: str | None = None,
    description: str | None = None,
    update_description: bool = False,
    is_active: bool | None = None,
) -> Designation:
    if name is not None:
        designation.name = name.strip()
    if code is not None:
        designation.code = code.strip().upper()
    if update_description:
        designation.description = description
    if is_active is not None:
        designation.is_active = is_active
    await session.flush()
    return designation


async def delete_designation_record(
    session: AsyncSession,
    designation: Designation,
) -> None:
    await session.delete(designation)
    await session.flush()


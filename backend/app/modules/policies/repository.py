from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy import PolicyMaster
from app.models.shift import ShiftTemplate


async def insert_policy(session: AsyncSession, row: PolicyMaster) -> PolicyMaster:
    session.add(row)
    await session.flush()
    return row


async def list_policies(
    session: AsyncSession,
    tenant_id: UUID,
    is_active: bool | None = None,
) -> list[PolicyMaster]:
    stmt = select(PolicyMaster).where(PolicyMaster.tenant_id == tenant_id)
    if is_active is not None:
        stmt = stmt.where(PolicyMaster.is_active == is_active)
    stmt = stmt.order_by(PolicyMaster.code)
    return list((await session.scalars(stmt)).all())


async def get_policy(session: AsyncSession, tenant_id: UUID, policy_id: UUID) -> PolicyMaster | None:
    stmt = select(PolicyMaster).where(PolicyMaster.tenant_id == tenant_id, PolicyMaster.id == policy_id)
    return await session.scalar(stmt)


async def get_policy_by_code(session: AsyncSession, tenant_id: UUID, code: str) -> PolicyMaster | None:
    stmt = select(PolicyMaster).where(PolicyMaster.tenant_id == tenant_id, PolicyMaster.code == code)
    return await session.scalar(stmt)


async def delete_policy(session: AsyncSession, row: PolicyMaster) -> None:
    await session.delete(row)
    await session.flush()


async def count_shifts_using_policy(session: AsyncSession, tenant_id: UUID, policy_id: UUID) -> int:
    stmt = select(func.count(ShiftTemplate.id)).where(
        ShiftTemplate.tenant_id == tenant_id,
        ShiftTemplate.policy_id == policy_id,
    )
    result = await session.scalar(stmt)
    return result or 0

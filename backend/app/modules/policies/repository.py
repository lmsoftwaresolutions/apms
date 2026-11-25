from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.policy import PolicyMaster, PolicyScopeOverride
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


async def insert_override(session: AsyncSession, row: PolicyScopeOverride) -> PolicyScopeOverride:
    session.add(row)
    await session.flush()
    return row


async def get_override(
    session: AsyncSession, tenant_id: UUID, override_id: UUID
) -> PolicyScopeOverride | None:
    stmt = select(PolicyScopeOverride).where(
        PolicyScopeOverride.tenant_id == tenant_id, PolicyScopeOverride.id == override_id
    )
    return await session.scalar(stmt)


async def get_override_by_scope(
    session: AsyncSession, tenant_id: UUID, scope_type: str, scope_id: UUID
) -> PolicyScopeOverride | None:
    stmt = select(PolicyScopeOverride).where(
        PolicyScopeOverride.tenant_id == tenant_id,
        PolicyScopeOverride.scope_type == scope_type,
        PolicyScopeOverride.scope_id == scope_id,
    )
    return await session.scalar(stmt)


async def list_overrides(
    session: AsyncSession,
    tenant_id: UUID,
    scope_type: str | None = None,
    scope_id: UUID | None = None,
) -> list[PolicyScopeOverride]:
    stmt = select(PolicyScopeOverride).where(PolicyScopeOverride.tenant_id == tenant_id)
    if scope_type:
        stmt = stmt.where(PolicyScopeOverride.scope_type == scope_type)
    if scope_id:
        stmt = stmt.where(PolicyScopeOverride.scope_id == scope_id)
    stmt = stmt.order_by(PolicyScopeOverride.created_at.desc())
    return list((await session.scalars(stmt)).all())


async def delete_override(session: AsyncSession, row: PolicyScopeOverride) -> None:
    await session.delete(row)
    await session.flush()


from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.branch import Branch


async def list_branches_by_tenant(session: AsyncSession, tenant_id: UUID) -> list[Branch]:
    stmt = select(Branch).where(Branch.tenant_id == tenant_id).order_by(Branch.code)
    return list((await session.scalars(stmt)).all())


async def get_branch_by_id(session: AsyncSession, tenant_id: UUID, branch_id: UUID) -> Branch | None:
    branch = await session.get(Branch, branch_id)
    if branch is None or branch.tenant_id != tenant_id:
        return None
    return branch


async def insert_branch(session: AsyncSession, branch: Branch) -> Branch:
    session.add(branch)
    await session.flush()
    return branch


async def update_branch_fields(
    session: AsyncSession,
    branch: Branch,
    name: str | None,
    code: str | None,
    is_active: bool | None,
) -> Branch:
    if name is not None:
        branch.name = name
    if code is not None:
        branch.code = code
    if is_active is not None:
        branch.is_active = is_active
    await session.flush()
    return branch


async def delete_branch_record(session: AsyncSession, branch: Branch) -> None:
    await session.delete(branch)
    await session.flush()

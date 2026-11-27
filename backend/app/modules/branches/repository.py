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
    registration_number: str | None = None,
    update_registration: bool = False,
    geofence_latitude: float | None = None,
    geofence_longitude: float | None = None,
    geofence_radius_m: int | None = None,
    allowed_bssids: list[str] | None = None,
    update_geofence_fields: set[str] | None = None,
) -> Branch:
    if name is not None:
        branch.name = name
    if code is not None:
        branch.code = code
    if is_active is not None:
        branch.is_active = is_active
    if update_registration:
        branch.registration_number = registration_number
    fields = update_geofence_fields or set()
    if "geofence_latitude" in fields:
        branch.geofence_latitude = geofence_latitude
    if "geofence_longitude" in fields:
        branch.geofence_longitude = geofence_longitude
    if "geofence_radius_m" in fields:
        branch.geofence_radius_m = geofence_radius_m
    if "allowed_bssids" in fields:
        branch.allowed_bssids = allowed_bssids
    await session.flush()
    return branch


async def delete_branch_record(session: AsyncSession, branch: Branch) -> None:
    await session.delete(branch)
    await session.flush()

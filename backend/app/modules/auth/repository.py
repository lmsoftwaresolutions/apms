from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.iam import Permission, RolePermission, Tenant, User, UserRole


async def lookup_user_record(session: AsyncSession, email: str) -> tuple[dict, User, Tenant] | None:
    """Execute raw SQL function for initial lookup and return user with tenant."""
    result = await session.execute(
        text(
            """
            SELECT id, tenant_id, hashed_password, is_active
            FROM iam_lookup_user(:email)
            """
        ),
        {"email": email.lower()},
    )
    row = result.first()
    if row is None or not row.is_active:
        return None

    # Set temporary tenant context to fetch user and tenant
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(row.tenant_id)},
    )
    user = await session.get(User, row.id)
    tenant = await session.get(Tenant, row.tenant_id)
    if user is None or tenant is None or not tenant.is_active:
        return None

    row_data = {
        "id": row.id,
        "tenant_id": row.tenant_id,
        "hashed_password": row.hashed_password,
        "is_active": row.is_active,
    }
    return row_data, user, tenant


async def get_tenant(session: AsyncSession, tenant_id: UUID) -> Tenant | None:
    return await session.get(Tenant, tenant_id)


async def update_tenant(session: AsyncSession, tenant: Tenant, display_name: str | None, logo_url: str | None) -> Tenant:
    if display_name is not None:
        tenant.display_name = display_name
    if logo_url is not None:
        tenant.logo_url = logo_url
    await session.flush()
    return tenant


async def get_user_permissions(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> list[str]:
    rows = await session.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .join(
            UserRole,
            (UserRole.role_id == RolePermission.role_id) & (UserRole.tenant_id == RolePermission.tenant_id),
        )
        .where(UserRole.tenant_id == tenant_id, UserRole.user_id == user_id)
        .order_by(Permission.code)
    )
    return list(dict.fromkeys(rows.all()))

from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession


class LoginLookup:
    def __init__(self, user_id: UUID, tenant_id: UUID, hashed_password: str, is_active: bool) -> None:
        self.user_id = user_id
        self.tenant_id = tenant_id
        self.hashed_password = hashed_password
        self.is_active = is_active


async def lookup_login(session: AsyncSession, email: str) -> LoginLookup | None:
    """Find a login before a tenant is selected. Does not read IAM tables."""
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

    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(row.tenant_id)},
    )
    return LoginLookup(
        user_id=row.id,
        tenant_id=row.tenant_id,
        hashed_password=row.hashed_password,
        is_active=row.is_active,
    )

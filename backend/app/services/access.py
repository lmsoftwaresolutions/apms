from uuid import UUID

from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.core.security import verify_password
from app.models.iam import Permission, Role, RolePermission, User, UserRole


async def permissions_for_user(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> list[str]:
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


async def require_codes(session: AsyncSession, codes: list[str]) -> dict[str, Permission]:
    if not codes:
        return {}
    found = {row.code: row for row in (await session.scalars(select(Permission).where(Permission.code.in_(codes)))).all()}
    missing = sorted(set(codes) - set(found))
    if missing:
        raise ProblemError(422, "Unknown permission", ", ".join(missing))
    return found


def has_permission(granted: set[str], required: str) -> bool:
    return required in granted


async def lookup_login(session: AsyncSession, email: str, password: str) -> tuple[User, object]:
    from app.models.iam import Tenant

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
    password_ok = verify_password(password, row.hashed_password if row else None)
    if row is None or not password_ok or not row.is_active:
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(row.tenant_id)},
    )
    user = await session.get(User, row.id)
    tenant = await session.get(Tenant, row.tenant_id)
    if user is None or tenant is None or not tenant.is_active:
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")
    return user, tenant


async def role_codes_for_user(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> list[str]:
    rows = await session.scalars(
        select(Role.code)
        .join(UserRole, (UserRole.role_id == Role.id) & (UserRole.tenant_id == Role.tenant_id))
        .where(UserRole.tenant_id == tenant_id, UserRole.user_id == user_id)
        .order_by(Role.code)
    )
    return list(rows.all())

# Backwards compatibility bridge delegating to modular architecture
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.core.security import verify_password
from app.models.iam import Permission, Role, User
from app.modules.auth.repository import get_user_permissions as permissions_for_user
from app.modules.auth.repository import lookup_user_record
from app.modules.iam.repository import get_permissions_by_codes, get_role_codes_for_user as role_codes_for_user


def has_permission(granted: set[str], required: str) -> bool:
    return required in granted


async def require_codes(session: AsyncSession, codes: list[str]) -> dict[str, Permission]:
    if not codes:
        return {}
    found = await get_permissions_by_codes(session, codes)
    missing = sorted(set(codes) - set(found))
    if missing:
        raise ProblemError(422, "Unknown permission", ", ".join(missing))
    return found


async def lookup_login(session: AsyncSession, email: str, password: str) -> tuple[User, object]:
    lookup = await lookup_user_record(session, email)
    if lookup is None:
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    row_data, user, tenant = lookup
    if not verify_password(password, row_data["hashed_password"]):
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    return user, tenant


__all__ = [
    "has_permission",
    "permissions_for_user",
    "require_codes",
    "lookup_login",
    "role_codes_for_user",
]

from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import Depends, Header
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.core.security import decode_access_token
from app.models.iam import User
from app.services.access import permissions_for_user

bearer = HTTPBearer(auto_error=False)


class CurrentUser:
    def __init__(self, user: User, permissions: set[str]) -> None:
        self.user = user
        self.permissions = permissions
        self.tenant_id = user.tenant_id
        self.id = user.id


async def get_session() -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer)],
    session: Annotated[AsyncSession, Depends(get_session)],
) -> CurrentUser:
    if credentials is None:
        raise ProblemError(401, "Sign-in required", "Send a bearer token.")
    try:
        user_id, tenant_id = decode_access_token(credentials.credentials)
    except ValueError as exc:
        raise ProblemError(401, "Sign-in required", "The bearer token is invalid or expired.") from exc
    await set_tenant(session, tenant_id)
    user = await session.get(User, user_id)
    if user is None or not user.is_active or user.tenant_id != tenant_id:
        raise ProblemError(401, "Sign-in required", "The account is inactive or no longer exists.")
    permissions = set(await permissions_for_user(session, tenant_id, user_id))
    return CurrentUser(user, permissions)


def require_permission(code: str):
    async def checker(current: Annotated[CurrentUser, Depends(get_current_user)]) -> CurrentUser:
        if code not in current.permissions:
            raise ProblemError(403, "Forbidden", f"Missing permission {code}.")
        return current

    return checker


SessionDep = Annotated[AsyncSession, Depends(get_session)]
CurrentDep = Annotated[CurrentUser, Depends(get_current_user)]


def tenant_of(current: CurrentUser) -> UUID:
    return current.tenant_id


def idempotency_header(idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None) -> str | None:
    return idempotency_key


IdempotencyDep = Annotated[str | None, Depends(idempotency_header)]


from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.core.security import create_access_token, verify_password
from app.models.iam import User
from app.modules.auth import repository as auth_repo
from app.modules.auth.schemas import LoginIn, MeOut, TenantOut, TenantUpdate, TokenOut


async def authenticate_user(session: AsyncSession, payload: LoginIn) -> TokenOut:
    lookup = await auth_repo.lookup_user_record(session, payload.email)
    if lookup is None:
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    row_data, user, _tenant = lookup
    if not verify_password(payload.password, row_data["hashed_password"]):
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    token = create_access_token(user.id, user.tenant_id)
    return TokenOut(access_token=token)


async def get_current_user_profile(session: AsyncSession, tenant_id: UUID, user: User) -> MeOut:
    tenant = await auth_repo.get_tenant(session, tenant_id)
    if tenant is None:
        raise ProblemError(404, "Tenant not found", "Current tenant does not exist.")

    permissions = sorted(await auth_repo.get_user_permissions(session, tenant_id, user.id))
    return MeOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        tenant=TenantOut(id=tenant.id, display_name=tenant.display_name, logo_url=tenant.logo_url),
        permissions=permissions,
    )


async def update_tenant_profile(session: AsyncSession, tenant_id: UUID, payload: TenantUpdate) -> TenantOut:
    tenant = await auth_repo.get_tenant(session, tenant_id)
    if tenant is None:
        raise ProblemError(404, "Tenant not found", "No tenant exists with this id.")

    updated = await auth_repo.update_tenant(session, tenant, payload.display_name, payload.logo_url)
    return TenantOut(id=updated.id, display_name=updated.display_name, logo_url=updated.logo_url)

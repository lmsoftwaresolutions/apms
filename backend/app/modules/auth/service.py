from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.core.security import create_access_token, verify_password
from app.modules.auth import repository as auth_repo
from app.modules.auth.schemas import LoginIn, MeOut, TenantOut, TenantUpdate, TokenOut
from app.modules.iam import repository as iam_repo


async def authenticate_user(session: AsyncSession, payload: LoginIn) -> TokenOut:
    lookup = await auth_repo.lookup_login(session, payload.email)
    if lookup is None:
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    user = await iam_repo.get_user_by_id(session, lookup.user_id)
    tenant = await iam_repo.get_tenant(session, lookup.tenant_id)
    if user is None or tenant is None or not tenant.is_active or not user.is_active:
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")
    if not verify_password(payload.password, lookup.hashed_password):
        raise ProblemError(401, "Sign-in failed", "Email or password is wrong, or the account is inactive.")

    token = create_access_token(user.id, user.tenant_id)
    return TokenOut(access_token=token)


async def get_current_user_profile(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    email: str,
    full_name: str,
) -> MeOut:
    tenant = await iam_repo.get_tenant(session, tenant_id)
    if tenant is None:
        raise ProblemError(404, "Tenant not found", "Current tenant does not exist.")

    permissions = sorted(await iam_repo.get_user_permissions(session, tenant_id, user_id))
    return MeOut(
        id=user_id,
        email=email,
        full_name=full_name,
        tenant=TenantOut(id=tenant.id, display_name=tenant.display_name, logo_url=tenant.logo_url),
        permissions=permissions,
    )


async def update_tenant_profile(session: AsyncSession, tenant_id: UUID, payload: TenantUpdate) -> TenantOut:
    tenant = await iam_repo.get_tenant(session, tenant_id)
    if tenant is None:
        raise ProblemError(404, "Tenant not found", "No tenant exists with this id.")

    clean_name: str | None = None
    if payload.display_name is not None:
        clean_name = payload.display_name.strip()
        if not clean_name:
            raise ProblemError(422, "Invalid display name", "Display name cannot be blank.")

    update_logo = "logo_url" in payload.model_fields_set
    clean_logo: str | None = None
    if update_logo and payload.logo_url is not None:
        stripped_logo = payload.logo_url.strip()
        if stripped_logo:
            if not stripped_logo.startswith(("https://", "http://", "/")):
                raise ProblemError(
                    422,
                    "Invalid logo URL",
                    "Logo URL must start with https://, http://, or /.",
                )
            clean_logo = stripped_logo

    updated = await iam_repo.update_tenant(
        session,
        tenant,
        clean_name,
        clean_logo,
        update_logo=update_logo,
    )
    return TenantOut(id=updated.id, display_name=updated.display_name, logo_url=updated.logo_url)

from typing import Annotated

from fastapi import APIRouter, Depends, Header

from app.api.deps import CurrentDep, SessionDep, get_current_user, require_permission
from app.core.security import create_access_token
from app.models.iam import Tenant
from app.schemas.iam import LoginIn, MeOut, TenantOut, TenantUpdate, TokenOut
from app.services.access import lookup_login, permissions_for_user

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut, summary="Sign in with email and password")
async def login(payload: LoginIn, session: SessionDep) -> TokenOut:
    user, _tenant = await lookup_login(session, payload.email, payload.password)
    return TokenOut(access_token=create_access_token(user.id, user.tenant_id))


@router.get("/me", response_model=MeOut, summary="Current user, tenant, and permissions")
async def me(current: Annotated[object, Depends(get_current_user)], session: SessionDep) -> MeOut:
    tenant = await session.get(Tenant, current.tenant_id)
    permissions = sorted(await permissions_for_user(session, current.tenant_id, current.user.id))
    return MeOut(
        id=current.user.id,
        email=current.user.email,
        full_name=current.user.full_name,
        tenant=TenantOut(id=tenant.id, display_name=tenant.display_name, logo_url=tenant.logo_url),
        permissions=permissions,
    )


@router.patch("/tenant", response_model=TenantOut, summary="Update the tenant display name or logo")
async def update_tenant(
    payload: TenantUpdate,
    current: Annotated[object, Depends(require_permission("org.tenant.update"))],
    session: SessionDep,
) -> TenantOut:
    tenant = await session.get(Tenant, current.tenant_id)
    if payload.display_name is not None:
        tenant.display_name = payload.display_name
    if payload.logo_url is not None:
        tenant.logo_url = payload.logo_url or None
    await session.flush()
    return TenantOut(id=tenant.id, display_name=tenant.display_name, logo_url=tenant.logo_url)


def idempotency_header(idempotency_key: Annotated[str | None, Header(alias="Idempotency-Key")] = None) -> str | None:
    return idempotency_key


IdempotencyDep = Annotated[str | None, Depends(idempotency_header)]
CurrentUserDep = CurrentDep

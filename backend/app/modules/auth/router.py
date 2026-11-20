from typing import Annotated

from fastapi import APIRouter, Depends

from app.api.deps import CurrentUser, SessionDep, get_current_user, require_permission
from app.modules.auth import service as auth_service
from app.modules.auth.schemas import LoginIn, MeOut, TenantOut, TenantUpdate, TokenOut

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/login", response_model=TokenOut, summary="Sign in with email and password")
async def login(payload: LoginIn, session: SessionDep) -> TokenOut:
    return await auth_service.authenticate_user(session, payload)


@router.get("/me", response_model=MeOut, summary="Current user, tenant, and permissions")
async def me(current: Annotated[CurrentUser, Depends(get_current_user)], session: SessionDep) -> MeOut:
    return await auth_service.get_current_user_profile(session, current.tenant_id, current.user)


@router.patch("/tenant", response_model=TenantOut, summary="Update tenant display name or logo")
async def update_tenant(
    payload: TenantUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.tenant.update"))],
) -> TenantOut:
    return await auth_service.update_tenant_profile(session, current.tenant_id, payload)

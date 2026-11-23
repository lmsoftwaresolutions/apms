from collections.abc import AsyncIterator
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import CurrentUser, get_current_user, require_permission
from app.core.database import MigrateSession
from app.modules.platform import service as platform_service
from app.modules.platform.schemas import (
    TenantListItem,
    TenantProvisionRequest,
    TenantStatusUpdate,
)

router = APIRouter(prefix="/platform/tenants", tags=["platform"])


async def get_platform_session() -> AsyncIterator[AsyncSession]:
    """Privileged session that bypasses tenant RLS to perform cross-tenant platform operations."""
    async with MigrateSession() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


PlatformSessionDep = Annotated[AsyncSession, Depends(get_platform_session)]


@router.get(
    "",
    response_model=list[TenantListItem],
    summary="List all tenant organizations (Super Admin)",
)
async def list_tenants_endpoint(
    session: PlatformSessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("platform.tenant.create"))],
) -> list[TenantListItem]:
    return await platform_service.list_tenants(session)


@router.post(
    "",
    response_model=TenantListItem,
    status_code=status.HTTP_201_CREATED,
    summary="Provision a new tenant organization with primary admin and default branch",
)
async def provision_tenant_endpoint(
    payload: TenantProvisionRequest,
    session: PlatformSessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("platform.tenant.create"))],
) -> TenantListItem:
    return await platform_service.provision_tenant(session, payload)


@router.patch(
    "/{tenant_id}/status",
    response_model=TenantListItem,
    summary="Suspend or activate a tenant organization",
)
async def update_tenant_status_endpoint(
    tenant_id: UUID,
    payload: TenantStatusUpdate,
    session: PlatformSessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("platform.tenant.create"))],
) -> TenantListItem:
    return await platform_service.update_tenant_status(session, tenant_id, payload.is_active)

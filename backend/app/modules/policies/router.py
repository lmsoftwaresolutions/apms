from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.policies.schemas import (
    EffectivePolicyConfig,
    PolicyCreate,
    PolicyOut,
    PolicyOverrideCreate,
    PolicyOverrideOut,
    PolicyOverrideUpdate,
    PolicyUpdate,
)
from app.modules.policies.service import (
    create_override,
    create_policy,
    delete_override,
    delete_policy,
    get_effective_config,
    get_override,
    get_policy,
    list_overrides,
    list_policies,
    update_override,
    update_policy,
)

router = APIRouter(prefix="/policies", tags=["policies"])


@router.get("", response_model=list[PolicyOut])
async def list_policies_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy.master.read"))],
    is_active: Annotated[bool | None, Query()] = None,
) -> list[PolicyOut]:
    return await list_policies(session, current.tenant_id, is_active=is_active)


@router.post("", response_model=PolicyOut, status_code=status.HTTP_201_CREATED)
async def create_policy_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy.master.create"))],
    data: PolicyCreate,
    idempotency_key: IdempotencyDep = None,
) -> PolicyOut:
    return await create_policy(session, current.tenant_id, data)


@router.post("/overrides", response_model=PolicyOverrideOut, status_code=status.HTTP_201_CREATED)
async def create_override_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy_override:create", "policy.override.create", "policy.master.create"))],
    data: PolicyOverrideCreate,
) -> PolicyOverrideOut:
    return await create_override(session, current.tenant_id, data)


@router.get("/overrides", response_model=list[PolicyOverrideOut])
async def list_overrides_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy_override:read", "policy.override.read", "policy.master.read"))],
    scope_type: Annotated[str | None, Query()] = None,
    scope_id: Annotated[UUID | None, Query()] = None,
) -> list[PolicyOverrideOut]:
    return await list_overrides(session, current.tenant_id, scope_type=scope_type, scope_id=scope_id)


@router.get("/effective-config", response_model=EffectivePolicyConfig)
async def preview_effective_config_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy_override:read", "policy.override.read", "policy.master.read"))],
    employee_id: Annotated[UUID, Query()],
) -> EffectivePolicyConfig:
    return await get_effective_config(session, current.tenant_id, employee_id)


@router.get("/overrides/{override_id}", response_model=PolicyOverrideOut)
async def get_override_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy_override:read", "policy.override.read", "policy.master.read"))],
    override_id: UUID,
) -> PolicyOverrideOut:
    return await get_override(session, current.tenant_id, override_id)


@router.put("/overrides/{override_id}", response_model=PolicyOverrideOut)
async def update_override_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy_override:update", "policy.override.update", "policy.master.update"))],
    override_id: UUID,
    data: PolicyOverrideUpdate,
) -> PolicyOverrideOut:
    return await update_override(session, current.tenant_id, override_id, data)


@router.delete("/overrides/{override_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_override_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy_override:delete", "policy.override.delete", "policy.master.delete"))],
    override_id: UUID,
) -> None:
    await delete_override(session, current.tenant_id, override_id)


@router.get("/{policy_id}", response_model=PolicyOut)
async def get_policy_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy.master.read"))],
    policy_id: UUID,
) -> PolicyOut:
    return await get_policy(session, current.tenant_id, policy_id)


@router.put("/{policy_id}", response_model=PolicyOut)
async def update_policy_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy.master.update"))],
    policy_id: UUID,
    data: PolicyUpdate,
) -> PolicyOut:
    return await update_policy(session, current.tenant_id, policy_id, data)


@router.delete("/{policy_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_policy_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("policy.master.delete"))],
    policy_id: UUID,
) -> None:
    await delete_policy(session, current.tenant_id, policy_id)

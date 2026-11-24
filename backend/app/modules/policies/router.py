from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.policies.schemas import PolicyCreate, PolicyOut, PolicyUpdate
from app.modules.policies.service import (
    create_policy,
    delete_policy,
    get_policy,
    list_policies,
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

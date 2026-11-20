from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.iam import service as iam_service
from app.modules.iam.schemas import (
    AssignmentIn,
    DeletedOut,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserOut,
)
from app.services.idempotency import replay_or_reserve, store_response

router = APIRouter(tags=["iam"])


@router.get("/users", response_model=list[UserOut], summary="List directory users")
async def users(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.assignment.read"))],
) -> list[UserOut]:
    return await iam_service.list_users(session, current.tenant_id)


@router.post("/users/{user_id}/roles", response_model=UserOut, status_code=201, summary="Assign a role")
async def assign(
    user_id: UUID,
    payload: AssignmentIn,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.assignment.create"))],
) -> UserOut:
    return await iam_service.assign_role(session, current.tenant_id, user_id, payload.role_id)


@router.delete("/users/{user_id}/roles/{role_id}", status_code=204, summary="Remove a role assignment")
async def unassign(
    user_id: UUID,
    role_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.assignment.delete"))],
) -> None:
    await iam_service.unassign_role(session, current.tenant_id, user_id, role_id)


@router.get("/roles", response_model=list[RoleOut], summary="List roles with permissions")
async def roles(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.role.read"))],
) -> list[RoleOut]:
    return await iam_service.list_roles(session, current.tenant_id)


@router.post("/roles", response_model=RoleOut, status_code=201, summary="Create a custom role")
async def create_role_endpoint(
    payload: RoleCreate,
    response: Response,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.role.create"))],
    idempotency_key: IdempotencyDep,
) -> RoleOut:
    body_in = payload.model_dump(mode="json")
    replay = await replay_or_reserve(session, current.tenant_id, idempotency_key, "/api/v1/roles", body_in)
    if replay:
        response.status_code = int(replay["status_code"])
        return RoleOut.model_validate(replay["body"])

    created = await iam_service.create_role(session, current.tenant_id, payload)
    await store_response(
        session,
        current.tenant_id,
        idempotency_key,
        "/api/v1/roles",
        body_in,
        201,
        created.model_dump(mode="json"),
    )
    return created


@router.patch("/roles/{role_id}", response_model=RoleOut, summary="Update role name or permissions")
async def update_role_endpoint(
    role_id: UUID,
    payload: RoleUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.role.update"))],
) -> RoleOut:
    return await iam_service.update_role(session, current.tenant_id, role_id, payload)


@router.delete("/roles/{role_id}", response_model=DeletedOut, summary="Delete a custom role")
async def delete_role_endpoint(
    role_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.role.delete"))],
) -> DeletedOut:
    await iam_service.delete_role(session, current.tenant_id, role_id)
    return DeletedOut(id=role_id)


@router.get("/permissions", response_model=list[PermissionOut], summary="List all catalog permissions")
async def permissions_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("iam.role.read"))],
) -> list[PermissionOut]:
    return await iam_service.list_permissions(session)

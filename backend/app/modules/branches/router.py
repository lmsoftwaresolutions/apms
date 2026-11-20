from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Response

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.branches import service as branch_service
from app.modules.branches.schemas import BranchCreate, BranchOut, BranchUpdate, DeletedOut
from app.services.idempotency import replay_or_reserve, store_response

router = APIRouter(prefix="/branches", tags=["branches"])


@router.get("", response_model=list[BranchOut], summary="List branches")
async def branches(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.branch.read"))],
) -> list[BranchOut]:
    return await branch_service.list_branches(session, current.tenant_id)


@router.post("", response_model=BranchOut, status_code=201, summary="Create a branch")
async def create(
    payload: BranchCreate,
    response: Response,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.branch.create"))],
    idempotency_key: IdempotencyDep,
) -> BranchOut:
    body_in = payload.model_dump(mode="json")
    replay = await replay_or_reserve(session, current.tenant_id, idempotency_key, "/api/v1/branches", body_in)
    if replay:
        response.status_code = int(replay["status_code"])
        return BranchOut.model_validate(replay["body"])

    created = await branch_service.create_branch(session, current.tenant_id, payload)
    await store_response(
        session,
        current.tenant_id,
        idempotency_key,
        "/api/v1/branches",
        body_in,
        201,
        created.model_dump(mode="json"),
    )
    return created


@router.patch("/{branch_id}", response_model=BranchOut, summary="Update a branch")
async def update(
    branch_id: UUID,
    payload: BranchUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.branch.update"))],
) -> BranchOut:
    return await branch_service.update_branch(session, current.tenant_id, branch_id, payload)


@router.delete("/{branch_id}", response_model=DeletedOut, summary="Delete a branch")
async def remove(
    branch_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.branch.delete"))],
) -> DeletedOut:
    await branch_service.delete_branch(session, current.tenant_id, branch_id)
    return DeletedOut(id=branch_id)

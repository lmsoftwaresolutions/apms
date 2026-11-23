from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.designations import service as desig_service
from app.modules.designations.schemas import (
    DeletedOut,
    DesignationCreate,
    DesignationOut,
    DesignationUpdate,
)
from app.services.idempotency import replay_or_reserve, store_response

router = APIRouter(prefix="/designations", tags=["designations"])


@router.get("", response_model=list[DesignationOut], summary="List department designations")
async def designations(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.designation.read"))],
    department_id: Annotated[UUID | None, Query(description="Filter by department id")] = None,
) -> list[DesignationOut]:
    return await desig_service.list_designations(session, current.tenant_id, department_id)


@router.post("", response_model=DesignationOut, status_code=201, summary="Create a designation")
async def create(
    payload: DesignationCreate,
    response: Response,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.designation.create"))],
    idempotency_key: IdempotencyDep,
) -> DesignationOut:
    body_in = payload.model_dump(mode="json")
    replay = await replay_or_reserve(session, current.tenant_id, idempotency_key, "/api/v1/designations", body_in)
    if replay:
        response.status_code = int(replay["status_code"])
        return DesignationOut.model_validate(replay["body"])

    created = await desig_service.create_designation(session, current.tenant_id, payload)
    await store_response(
        session,
        current.tenant_id,
        idempotency_key,
        "/api/v1/designations",
        body_in,
        201,
        created.model_dump(mode="json"),
    )
    return created


@router.patch("/{designation_id}", response_model=DesignationOut, summary="Update a designation")
async def update(
    designation_id: UUID,
    payload: DesignationUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.designation.update"))],
) -> DesignationOut:
    return await desig_service.update_designation(session, current.tenant_id, designation_id, payload)


@router.delete("/{designation_id}", response_model=DeletedOut, summary="Delete a designation")
async def remove(
    designation_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.designation.delete"))],
) -> DeletedOut:
    await desig_service.delete_designation(session, current.tenant_id, designation_id)
    return DeletedOut(id=designation_id)


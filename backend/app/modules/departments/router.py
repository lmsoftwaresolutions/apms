from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.departments import service as dept_service
from app.modules.departments.schemas import (
    DeletedOut,
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)
from app.services.idempotency import replay_or_reserve, store_response

router = APIRouter(prefix="/departments", tags=["departments"])


@router.get("", response_model=list[DepartmentOut], summary="List departments")
async def departments(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.department.read"))],
    branch_id: Annotated[UUID | None, Query(description="Filter by branch id")] = None,
) -> list[DepartmentOut]:
    return await dept_service.list_departments(session, current.tenant_id, branch_id)


@router.post("", response_model=DepartmentOut, status_code=201, summary="Create a department")
async def create(
    payload: DepartmentCreate,
    response: Response,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.department.create"))],
    idempotency_key: IdempotencyDep,
) -> DepartmentOut:
    body_in = payload.model_dump(mode="json")
    replay = await replay_or_reserve(session, current.tenant_id, idempotency_key, "/api/v1/departments", body_in)
    if replay:
        response.status_code = int(replay["status_code"])
        return DepartmentOut.model_validate(replay["body"])

    created = await dept_service.create_department(session, current.tenant_id, payload)
    await store_response(
        session,
        current.tenant_id,
        idempotency_key,
        "/api/v1/departments",
        body_in,
        201,
        created.model_dump(mode="json"),
    )
    return created


@router.patch("/{department_id}", response_model=DepartmentOut, summary="Update a department")
async def update(
    department_id: UUID,
    payload: DepartmentUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.department.update"))],
) -> DepartmentOut:
    return await dept_service.update_department(session, current.tenant_id, department_id, payload)


@router.delete("/{department_id}", response_model=DeletedOut, summary="Delete a department")
async def remove(
    department_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("org.department.delete"))],
) -> DeletedOut:
    await dept_service.delete_department(session, current.tenant_id, department_id)
    return DeletedOut(id=department_id)


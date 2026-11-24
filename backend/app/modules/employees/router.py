from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.employees import service as emp_service
from app.modules.employees.schemas import DeletedOut, EmployeeCreate, EmployeeOut, EmployeeUpdate
from app.modules.privacy.service import unmask_employee
from app.services.idempotency import replay_or_reserve, store_response

router = APIRouter(prefix="/employees", tags=["employees"])


class UnmaskRequest(BaseModel):
    fields: list[str] = Field(min_length=1)


@router.post("/{employee_id}/unmask", summary="Reveal encrypted identifiers and write an audit row")
async def unmask(
    employee_id: UUID,
    payload: UnmaskRequest,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("privacy.pii.unmask"))],
) -> dict[str, str | None]:
    return await unmask_employee(
        session, current.tenant_id, employee_id, current.user.id, payload.fields
    )


@router.get("", response_model=list[EmployeeOut], summary="List employees")
async def list_all(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("employee.employee.read"))],
    branch_id: Annotated[UUID | None, Query(description="Filter by branch ID")] = None,
    department_id: Annotated[UUID | None, Query(description="Filter by department ID")] = None,
    is_active: Annotated[bool | None, Query(description="Filter by active status")] = None,
) -> list[EmployeeOut]:
    return await emp_service.list_employees(
        session=session,
        tenant_id=current.tenant_id,
        branch_id=branch_id,
        department_id=department_id,
        is_active=is_active,
    )


@router.get("/{employee_id}", response_model=EmployeeOut, summary="Get employee details")
async def get_one(
    employee_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("employee.employee.read"))],
) -> EmployeeOut:
    return await emp_service.get_employee(session, current.tenant_id, employee_id)


@router.post("", response_model=EmployeeOut, status_code=201, summary="Create an employee")
async def create(
    payload: EmployeeCreate,
    response: Response,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("employee.employee.create"))],
    idempotency_key: IdempotencyDep = None,
) -> EmployeeOut:
    body_in = payload.model_dump(mode="json")
    replay = await replay_or_reserve(session, current.tenant_id, idempotency_key, "/api/v1/employees", body_in)
    if replay:
        response.status_code = int(replay["status_code"])
        return EmployeeOut.model_validate(replay["body"])

    created = await emp_service.create_employee(
        session, current.tenant_id, payload, actor_user_id=current.user.id
    )
    await store_response(
        session,
        current.tenant_id,
        idempotency_key,
        "/api/v1/employees",
        body_in,
        201,
        created.model_dump(mode="json"),
    )
    return created


@router.patch("/{employee_id}", response_model=EmployeeOut, summary="Update an employee")
async def update(
    employee_id: UUID,
    payload: EmployeeUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("employee.employee.update"))],
) -> EmployeeOut:
    return await emp_service.update_employee(
        session, current.tenant_id, employee_id, payload, actor_user_id=current.user.id
    )


@router.delete("/{employee_id}", response_model=DeletedOut, summary="Deactivate an employee and keep attendance history")
async def remove(
    employee_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("employee.employee.delete"))],
) -> DeletedOut:
    await emp_service.delete_employee(session, current.tenant_id, employee_id)
    return DeletedOut(id=employee_id)

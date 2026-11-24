from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.work_modes.schemas import WorkModeApply, WorkModeOut, WorkModeReview
from app.modules.work_modes.service import apply_work_mode, list_requests, review_work_mode

router = APIRouter(prefix="/work-modes", tags=["work-modes"])


@router.post("/apply", response_model=WorkModeOut, status_code=status.HTTP_201_CREATED)
async def apply(
    payload: WorkModeApply,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("work_mode.request.create"))],
) -> WorkModeOut:
    target_emp_id = payload.employee_id
    if target_emp_id is None:
        from app.modules.employees.repository import get_employee_by_user_id
        emp = await get_employee_by_user_id(session, current.tenant_id, current.user.id)
        if emp is None:
            raise ProblemError(422, "Employee ID required", "employee_id must be provided when user is not an employee.")
        target_emp_id = emp.id

    row = await apply_work_mode(session, current.tenant_id, target_emp_id, payload)
    return WorkModeOut.model_validate(row)


@router.get("/requests", response_model=list[WorkModeOut])
async def get_requests(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("work_mode.request.read"))],
    employee_id: UUID | None = None,
    status_filter: str | None = Query(default=None, alias="status"),
    calendar_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WorkModeOut]:
    rows = await list_requests(
        session,
        current.tenant_id,
        employee_id=employee_id,
        status=status_filter,
        calendar_date=calendar_date,
        start_date=start_date,
        end_date=end_date,
    )
    return [WorkModeOut.model_validate(r) for r in rows]


@router.post("/requests/{request_id}/approve", response_model=WorkModeOut)
async def approve_request(
    request_id: UUID,
    payload: WorkModeReview,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("work_mode.request.review"))],
) -> WorkModeOut:
    row = await review_work_mode(
        session,
        current.tenant_id,
        request_id,
        approve=True,
        approver_user_id=current.user.id,
        decision_reason=payload.decision_reason,
    )
    return WorkModeOut.model_validate(row)


@router.post("/requests/{request_id}/reject", response_model=WorkModeOut)
async def reject_request(
    request_id: UUID,
    payload: WorkModeReview,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("work_mode.request.review"))],
) -> WorkModeOut:
    row = await review_work_mode(
        session,
        current.tenant_id,
        request_id,
        approve=False,
        approver_user_id=current.user.id,
        decision_reason=payload.decision_reason,
    )
    return WorkModeOut.model_validate(row)

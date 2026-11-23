from datetime import date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.employees import repository as emp_repo
from app.modules.regularizations.service import create_request, list_requests, review_request

router = APIRouter(prefix="/attendance/regularizations", tags=["regularizations"])


class RegularizationCreate(BaseModel):
    employee_id: UUID | None = None
    calendar_date: date
    request_type: str
    requested_in: datetime | None = None
    requested_out: datetime | None = None
    reason: str = Field(min_length=3, max_length=1000)


class RegularizationReview(BaseModel):
    approve: bool
    comment: str | None = None


class RegularizationOut(BaseModel):
    id: UUID
    employee_id: UUID
    calendar_date: date
    request_type: str
    status: str
    reason: str


def _out(row) -> RegularizationOut:
    return RegularizationOut(
        id=row.id,
        employee_id=row.employee_id,
        calendar_date=row.calendar_date,
        request_type=row.request_type,
        status=row.status,
        reason=row.reason,
    )


@router.post("", response_model=RegularizationOut, status_code=201)
async def create(
    payload: RegularizationCreate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.regularization.create"))],
) -> RegularizationOut:
    employee_id = payload.employee_id
    if "attendance.regularization.review" not in current.permissions:
        own = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
        if own is None:
            raise ProblemError(404, "Employee profile missing", "This sign-in is not linked to an employee.")
        employee_id = own.id
    elif employee_id is None:
        raise ProblemError(422, "Employee required", "A reviewer must name the employee.")
    row = await create_request(
        session,
        current.tenant_id,
        employee_id,
        payload.calendar_date,
        payload.request_type,
        payload.requested_in,
        payload.requested_out,
        payload.reason,
    )
    return _out(row)


@router.get("", response_model=list[RegularizationOut])
async def list_all(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.regularization.read"))],
) -> list[RegularizationOut]:
    employee_id = None
    if "attendance.regularization.review" not in current.permissions:
        own = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
        if own is None:
            return []
        employee_id = own.id
    rows = await list_requests(session, current.tenant_id, employee_id)
    return [_out(row) for row in rows]


@router.post("/{request_id}/review", response_model=RegularizationOut)
async def review(
    request_id: UUID,
    payload: RegularizationReview,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.regularization.review"))],
) -> RegularizationOut:
    row = await review_request(
        session,
        current.tenant_id,
        request_id,
        current.user.id,
        payload.approve,
        payload.comment,
    )
    return _out(row)

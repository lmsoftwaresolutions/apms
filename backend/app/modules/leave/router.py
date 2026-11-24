from datetime import date
from decimal import Decimal
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.employees import repository as emp_repo
from app.modules.leave.ledger import sandwiched_dates
from app.modules.leave.repository import list_holidays, list_leave_types, list_requests
from app.modules.leave.service import (
    create_holiday,
    create_leave_request,
    create_leave_type,
    credit_leave,
    employee_balances,
    review_leave_request,
)

router = APIRouter(prefix="/leave", tags=["leave"])


class LeaveTypeCreate(BaseModel):
    code: str = Field(min_length=2, max_length=30)
    name: str = Field(min_length=2, max_length=120)
    allow_negative_balance: bool = False
    sandwich_enabled: bool = False


class HolidayCreate(BaseModel):
    branch_id: UUID
    calendar_date: date
    name: str = Field(min_length=2, max_length=160)


class LeaveRequestCreate(BaseModel):
    employee_id: UUID | None = None
    leave_type_id: UUID
    start_date: date
    end_date: date
    portion: str = "FULL"
    reason: str = Field(min_length=3, max_length=1000)


class LeaveReview(BaseModel):
    approve: bool


class LeaveCredit(BaseModel):
    employee_id: UUID
    leave_type_id: UUID
    days: Decimal = Field(gt=0, max_digits=6, decimal_places=1)
    calendar_date: date
    entry_type: str = "ACCRUAL"


class SandwichDay(BaseModel):
    calendar_date: date
    kind: str
    status: str = "PRESENT"


@router.post("/types", status_code=201)
async def add_type(
    payload: LeaveTypeCreate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.type.manage"))],
) -> dict[str, str]:
    row = await create_leave_type(
        session,
        current.tenant_id,
        payload.code,
        payload.name,
        payload.allow_negative_balance,
        payload.sandwich_enabled,
    )
    return {"id": str(row.id), "code": row.code}


@router.get("/types")
async def types(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.read"))],
) -> list[dict[str, object]]:
    rows = await list_leave_types(session, current.tenant_id)
    return [
        {
            "id": str(row.id),
            "code": row.code,
            "name": row.name,
            "allow_negative_balance": row.allow_negative_balance,
            "sandwich_enabled": row.sandwich_enabled,
        }
        for row in rows
    ]


@router.post("/holidays", status_code=201)
async def add_holiday(
    payload: HolidayCreate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.holiday.manage"))],
) -> dict[str, str]:
    row = await create_holiday(
        session, current.tenant_id, payload.branch_id, payload.calendar_date, payload.name
    )
    return {"id": str(row.id), "name": row.name}


@router.get("/holidays")
async def holidays(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.read"))],
    branch_id: Annotated[UUID, Query()],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
) -> list[dict[str, str]]:
    rows = await list_holidays(session, current.tenant_id, branch_id, start_date, end_date)
    return [
        {"id": str(row.id), "calendar_date": row.calendar_date.isoformat(), "name": row.name} for row in rows
    ]


@router.post("/requests", status_code=201)
async def add_request(
    payload: LeaveRequestCreate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.create"))],
) -> dict[str, str]:
    employee_id = payload.employee_id
    if "leave.request.review" not in current.permissions:
        own = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
        if own is None:
            raise ProblemError(404, "Employee profile missing", "This sign-in is not linked to an employee.")
        employee_id = own.id
    elif employee_id is None:
        raise ProblemError(422, "Employee required", "A reviewer must name the employee.")
    row = await create_leave_request(
        session,
        current.tenant_id,
        employee_id,
        payload.leave_type_id,
        payload.start_date,
        payload.end_date,
        payload.portion,
        payload.reason,
    )
    return {"id": str(row.id), "status": row.status, "days": str(row.days)}


@router.get("/requests")
async def requests(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.read"))],
) -> list[dict[str, str]]:
    employee_id = None
    if "leave.request.review" not in current.permissions:
        own = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
        if own is None:
            return []
        employee_id = own.id
    rows = await list_requests(session, current.tenant_id, employee_id)
    return [
        {
            "id": str(row.id),
            "employee_id": str(row.employee_id),
            "start_date": row.start_date.isoformat(),
            "end_date": row.end_date.isoformat(),
            "portion": row.portion,
            "days": str(row.days),
            "status": row.status,
        }
        for row in rows
    ]


@router.post("/requests/{request_id}/review")
async def review(
    request_id: UUID,
    payload: LeaveReview,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.review"))],
) -> dict[str, str]:
    row = await review_leave_request(
        session, current.tenant_id, request_id, current.user.id, payload.approve
    )
    return {"id": str(row.id), "status": row.status}


@router.post("/credits", status_code=201)
async def credit(
    payload: LeaveCredit,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.ledger.credit"))],
) -> dict[str, str]:
    row = await credit_leave(
        session,
        current.tenant_id,
        payload.employee_id,
        payload.leave_type_id,
        payload.days,
        payload.calendar_date,
        payload.entry_type,
    )
    return {"id": str(row.id), "entry_type": row.entry_type, "days": str(row.days)}


@router.get("/balances")
async def balances(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.read"))],
    employee_id: Annotated[UUID | None, Query()] = None,
) -> list[dict[str, str]]:
    target = employee_id
    if "leave.request.review" not in current.permissions:
        own = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
        if own is None:
            return []
        target = own.id
    elif target is None:
        raise ProblemError(422, "Employee required", "A reviewer must name the employee.")
    return await employee_balances(session, current.tenant_id, target)


@router.post("/sandwich")
async def sandwich(
    payload: list[SandwichDay],
    current: Annotated[CurrentUser, Depends(require_permission("leave.request.review"))],
) -> dict[str, list[str]]:
    del current
    dates = sandwiched_dates([(item.calendar_date, item.kind, item.status) for item in payload])
    return {"dates": [item.isoformat() for item in dates]}

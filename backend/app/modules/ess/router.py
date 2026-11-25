from datetime import UTC, date, datetime, time
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.attendance.repository import list_attendance_records
from app.modules.employees import repository as emp_repo
from app.modules.attendance.cutoff import ist_today
from app.modules.punches.repository import list_punch_events
from app.modules.roster.repository import list_dated_shift_instances
from app.modules.work_modes.schemas import WorkModeApply, WorkModeOut
from app.modules.work_modes.service import apply_work_mode, list_requests
from app.modules.overtime.schemas import OvertimeRecordOut
from app.modules.overtime.repository import list_overtime_records

router = APIRouter(prefix="/ess", tags=["ess"])


async def _own_employee(session, current: CurrentUser, *, require_active: bool = False):
    emp = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
    if emp is None:
        raise ProblemError(404, "Employee profile missing", "This sign-in is not linked to an employee.")
    if require_active and not emp.is_active:
        raise ProblemError(403, "Inactive employee", "Your employee profile has been deactivated.")
    return emp


@router.get("/today")
async def today(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("ess.calendar.read"))],
) -> dict[str, object]:
    emp = await _own_employee(session, current)
    day = ist_today(datetime.now(UTC))
    ist = ZoneInfo("Asia/Kolkata")
    start = datetime.combine(day, time.min, tzinfo=ist).astimezone(UTC)
    end = datetime.combine(day, time.max, tzinfo=ist).astimezone(UTC)
    punches = await list_punch_events(
        session, current.tenant_id, employee_id=emp.id, start_time=start, end_time=end
    )
    records = await list_attendance_records(
        session, current.tenant_id, employee_id=emp.id, start_date=day, end_date=day
    )
    record = records[0] if records else None
    return {
        "employee_id": str(emp.id),
        "calendar_date": day.isoformat(),
        "punches": [p.punch_time.isoformat() for p in punches],
        "status": None if record is None else record.status,
        "worked_duration_minutes": None if record is None else record.worked_duration_minutes,
        "anomaly_code": None if record is None else record.anomaly_code,
    }


@router.get("/calendar")
async def calendar(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("ess.calendar.read"))],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
) -> list[dict[str, object]]:
    emp = await _own_employee(session, current)
    records = await list_attendance_records(
        session,
        current.tenant_id,
        employee_id=emp.id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        {
            "calendar_date": row.calendar_date.isoformat(),
            "status": row.status,
            "worked_duration_minutes": row.worked_duration_minutes,
            "overtime_minutes": row.overtime_minutes,
            "anomaly_code": row.anomaly_code,
        }
        for row in records
    ]


@router.get("/shifts")
async def shifts(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("ess.calendar.read"))],
    start_date: Annotated[date, Query()],
    end_date: Annotated[date, Query()],
) -> list[dict[str, object]]:
    emp = await _own_employee(session, current)
    rows = await list_dated_shift_instances(
        session,
        current.tenant_id,
        employee_id=emp.id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        {
            "calendar_date": row.calendar_date.isoformat(),
            "status": row.status,
            "is_rest_day": row.is_rest_day,
            "sessions": row.sessions,
        }
        for row in rows
    ]


@router.post("/work-modes/apply", response_model=WorkModeOut, status_code=201)
async def ess_apply_work_mode(
    payload: WorkModeApply,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("work_mode.request.create"))],
) -> WorkModeOut:
    emp = await _own_employee(session, current, require_active=True)
    row = await apply_work_mode(session, current.tenant_id, emp.id, payload)
    return WorkModeOut.model_validate(row)


@router.get("/work-modes/my-requests", response_model=list[WorkModeOut])
async def ess_my_work_mode_requests(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("work_mode.request.read"))],
    status_filter: str | None = Query(default=None, alias="status"),
    calendar_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WorkModeOut]:
    emp = await _own_employee(session, current)
    rows = await list_requests(
        session,
        current.tenant_id,
        employee_id=emp.id,
        status=status_filter,
        calendar_date=calendar_date,
        start_date=start_date,
        end_date=end_date,
    )
    return [WorkModeOut.model_validate(r) for r in rows]


@router.get("/overtime/my-records", response_model=list[OvertimeRecordOut])
async def ess_my_overtime_records(
    session: SessionDep,
    current: Annotated[
        CurrentUser,
        Depends(require_permission("overtime_record:read", "overtime.record.read", "ess.calendar.read")),
    ],
    status_filter: str | None = Query(default=None, alias="status"),
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[OvertimeRecordOut]:
    emp = await _own_employee(session, current)
    rows = await list_overtime_records(
        session,
        current.tenant_id,
        employee_id=emp.id,
        status=status_filter,
        start_date=start_date,
        end_date=end_date,
    )
    return [OvertimeRecordOut.model_validate(r) for r in rows]



from datetime import UTC, date, datetime, time
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.attendance.repository import list_attendance_records
from app.modules.employees import repository as emp_repo
from app.modules.punches.repository import list_punch_events

router = APIRouter(prefix="/ess", tags=["ess"])


async def _own_employee(session, current: CurrentUser):
    emp = await emp_repo.get_employee_by_user_id(session, current.tenant_id, current.user.id)
    if emp is None:
        raise ProblemError(404, "Employee profile missing", "This sign-in is not linked to an employee.")
    return emp


@router.get("/today")
async def today(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("ess.calendar.read"))],
) -> dict[str, object]:
    emp = await _own_employee(session, current)
    day = date.today()
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

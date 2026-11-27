from datetime import UTC, date, datetime, time
import math
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel, Field

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.attendance.repository import list_attendance_records
from app.modules.branches import repository as branch_repo
from app.modules.employees import repository as emp_repo
from app.modules.attendance.cutoff import ist_today
from app.modules.punches.repository import list_punch_events
from app.modules.punches.service import process_and_ingest_punches
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


def _haversine_distance_m(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    earth_radius_m = 6_371_000.0
    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    d_phi = math.radians(lat2 - lat1)
    d_lam = math.radians(lon2 - lon1)
    a = math.sin(d_phi / 2.0) ** 2 + math.cos(phi1) * math.cos(phi2) * math.sin(d_lam / 2.0) ** 2
    return 2.0 * earth_radius_m * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))


class MobilePunchRequest(BaseModel):
    punch_direction: str = Field(default="IN", pattern=r"^(IN|OUT)$")
    latitude: float = Field(ge=-90.0, le=90.0)
    longitude: float = Field(ge=-180.0, le=180.0)
    accuracy_m: float | None = Field(default=None, ge=0.0)


def _require_inside_geofence(branch: object | None, latitude: float, longitude: float) -> tuple[float, int]:
    """Accept a mobile punch only when the server's own distance is inside the saved radius."""
    latitude_value = getattr(branch, "geofence_latitude", None)
    longitude_value = getattr(branch, "geofence_longitude", None)
    radius_m = getattr(branch, "geofence_radius_m", None)
    if latitude_value is None or longitude_value is None or radius_m is None:
        raise ProblemError(
            422,
            "Geofence is not configured",
            "This branch has no geofence coordinates and radius. A mobile punch cannot be recorded.",
        )
    distance_m = round(
        _haversine_distance_m(latitude, longitude, float(latitude_value), float(longitude_value)),
        2,
    )
    if distance_m > radius_m:
        raise ProblemError(
            422,
            "Outside the branch geofence",
            f"This punch is {distance_m} m from the branch. The allowed radius is {radius_m} m.",
        )
    return distance_m, int(radius_m)


@router.get("/mobile-punch/context")
async def ess_mobile_punch_context(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("ess.calendar.read"))],
) -> dict[str, object]:
    emp = await _own_employee(session, current)
    branch = (
        await branch_repo.get_branch_by_id(session, current.tenant_id, emp.branch_id)
        if emp.branch_id is not None
        else None
    )
    day = ist_today(datetime.now(UTC))
    ist = ZoneInfo("Asia/Kolkata")
    start = datetime.combine(day, time.min, tzinfo=ist).astimezone(UTC)
    end = datetime.combine(day, time.max, tzinfo=ist).astimezone(UTC)
    punches = await list_punch_events(
        session, current.tenant_id, employee_id=emp.id, start_time=start, end_time=end
    )
    return {
        "employee_id": str(emp.id),
        "employee_code": emp.employee_code,
        "full_name": emp.full_name,
        "branch": None
        if branch is None
        else {
            "id": str(branch.id),
            "name": branch.name,
            "code": branch.code,
            "geofence_latitude": branch.geofence_latitude,
            "geofence_longitude": branch.geofence_longitude,
            "geofence_radius_m": branch.geofence_radius_m,
        },
        "today_punches": [
            {
                "id": str(p.id),
                "punch_time": p.punch_time.isoformat(),
                "punch_direction": p.punch_direction,
                "source": p.source,
                "status": p.status,
                "location_meta": p.location_meta,
            }
            for p in punches
        ],
    }


@router.post("/mobile-punch")
async def ess_mobile_punch(
    payload: MobilePunchRequest,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("ess.calendar.read"))],
) -> dict[str, object]:
    emp = await _own_employee(session, current, require_active=True)
    branch = (
        await branch_repo.get_branch_by_id(session, current.tenant_id, emp.branch_id)
        if emp.branch_id is not None
        else None
    )

    distance_m, branch_radius_m = _require_inside_geofence(branch, payload.latitude, payload.longitude)

    punch_time = datetime.now(UTC)
    raw_payload = {
        "employee_code": emp.employee_code,
        "punch_time": punch_time.isoformat(),
        "punch_direction": payload.punch_direction,
        "latitude": payload.latitude,
        "longitude": payload.longitude,
        "accuracy_m": payload.accuracy_m,
        "distance_m": distance_m,
        "geofence_verified": True,
        "branch_id": str(branch.id) if branch else None,
        "branch_radius_m": branch_radius_m,
    }
    ingest_res = await process_and_ingest_punches(
        session=session,
        tenant_id=current.tenant_id,
        source="MOBILE_GEO",
        raw_payload=raw_payload,
        device_identifier="ess_mobile_web",
    )
    return {
        "punch_time": punch_time.isoformat(),
        "punch_direction": payload.punch_direction,
        "distance_m": distance_m,
        "branch_radius_m": branch_radius_m,
        "geofence_verified": True,
        "ingest": ingest_res.model_dump(mode="json"),
    }



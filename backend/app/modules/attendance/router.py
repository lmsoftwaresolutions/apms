from datetime import UTC, date, datetime
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.attendance.repository import (
    get_attendance_record_by_id,
    get_trace_by_record_id,
    list_attendance_records,
    list_rollup_failures,
)
from app.modules.attendance.schemas import (
    AttendanceTraceRead,
    DailyAttendanceRead,
    RecalculateAttendanceRequest,
)
from app.modules.attendance.cutoff import run_cutoff_rollup
from app.modules.attendance.service import calculate_and_save_daily_attendance

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.get(
    "/daily",
    response_model=list[DailyAttendanceRead],
    summary="List daily attendance records for tenant",
)
async def list_daily_attendance_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.daily.read"))],
    employee_id: Annotated[UUID | None, Query()] = None,
    start_date: Annotated[date | None, Query()] = None,
    end_date: Annotated[date | None, Query()] = None,
) -> list[DailyAttendanceRead]:
    records = await list_attendance_records(
        session=session,
        tenant_id=current.tenant_id,
        employee_id=employee_id,
        start_date=start_date,
        end_date=end_date,
    )
    return [
        DailyAttendanceRead(
            id=r.id,
            tenant_id=r.tenant_id,
            employee_id=r.employee_id,
            calendar_date=r.calendar_date,
            dated_shift_instance_id=r.dated_shift_instance_id,
            status=r.status,
            worked_duration_minutes=r.worked_duration_minutes,
            scheduled_duration_minutes=r.scheduled_duration_minutes,
            worked_ratio=float(r.worked_ratio),
            late_minutes=r.late_minutes,
            early_departure_minutes=r.early_departure_minutes,
            overtime_minutes=r.overtime_minutes,
            is_single_punch=r.is_single_punch,
            anomaly_code=r.anomaly_code,
            created_at=r.created_at,
            updated_at=r.updated_at,
        )
        for r in records
    ]


@router.get(
    "/{record_id}/trace",
    response_model=AttendanceTraceRead,
    summary="Get immutable JSON explanation trace for daily record",
)
async def get_trace_endpoint(
    record_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.trace.read"))],
) -> AttendanceTraceRead:
    trace = await get_trace_by_record_id(
        session=session,
        tenant_id=current.tenant_id,
        record_id=record_id,
    )
    if trace is None:
        raise ProblemError(
            status_code=404,
            title="Explanation trace not found",
            detail="No explanation trace found for this attendance record.",
        )
    return AttendanceTraceRead(
        id=trace.id,
        tenant_id=trace.tenant_id,
        attendance_record_id=trace.attendance_record_id,
        employee_id=trace.employee_id,
        calendar_date=trace.calendar_date,
        trace_payload=trace.trace_payload,
        evaluated_at=trace.evaluated_at,
    )


@router.get("/rollup/failures", summary="List attendance evaluations that failed after a punch or cutoff")
async def list_failures(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.rollup.read"))],
) -> list[dict[str, object]]:
    rows = await list_rollup_failures(session, current.tenant_id)
    return [
        {
            "id": str(row.id),
            "employee_id": str(row.employee_id),
            "calendar_date": row.calendar_date.isoformat(),
            "error_title": row.error_title,
            "error_detail": row.error_detail,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]


@router.post("/rollup/cutoff", summary="Evaluate dated shifts whose post-window has closed")
async def run_cutoff(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.daily.recalculate"))],
) -> dict[str, int]:
    evaluated = await run_cutoff_rollup(session, current.tenant_id, datetime.now(UTC))
    return {"evaluated": evaluated}


@router.post(
    "/recalculate",
    response_model=DailyAttendanceRead,
    summary="Trigger attendance recalculation for an employee and date",
)
async def recalculate_attendance_endpoint(
    body: RecalculateAttendanceRequest,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("attendance.daily.recalculate"))],
) -> DailyAttendanceRead:
    record, _ = await calculate_and_save_daily_attendance(
        session=session,
        tenant_id=current.tenant_id,
        employee_id=body.employee_id,
        calendar_date=body.calendar_date,
    )
    return DailyAttendanceRead(
        id=record.id,
        tenant_id=record.tenant_id,
        employee_id=record.employee_id,
        calendar_date=record.calendar_date,
        dated_shift_instance_id=record.dated_shift_instance_id,
        status=record.status,
        worked_duration_minutes=record.worked_duration_minutes,
        scheduled_duration_minutes=record.scheduled_duration_minutes,
        worked_ratio=float(record.worked_ratio),
        late_minutes=record.late_minutes,
        early_departure_minutes=record.early_departure_minutes,
        overtime_minutes=record.overtime_minutes,
        is_single_punch=record.is_single_punch,
        anomaly_code=record.anomaly_code,
        created_at=record.created_at,
        updated_at=record.updated_at,
    )

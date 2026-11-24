from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.attendance import AttendanceDailyRecord, AttendanceExplanationTrace
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.engine.pairing import pair_punches_for_shift
from app.modules.attendance.engine.rollup import evaluate_daily_rollup
from app.modules.attendance.engine.trace import build_explanation_trace
from app.modules.attendance.repository import (
    find_attendance_record,
    get_attendance_record_by_id,
    get_trace_by_record_id,
    list_attendance_records,
    save_attendance_record,
    save_explanation_trace,
)
from app.modules.punches.repository import list_punches_for_employee


def punch_search_window(calendar_date: date) -> tuple[datetime, datetime]:
    """UTC window the daily rollup searches: 6 hours before the date through 14 hours after it."""
    start = datetime.combine(calendar_date, time(0, 0), tzinfo=UTC) - timedelta(hours=6)
    end = datetime.combine(calendar_date, time(23, 59, 59), tzinfo=UTC) + timedelta(hours=14)
    return start, end


async def calculate_and_save_daily_attendance(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
    shift_contract: ShiftInstanceContract | None = None,
    theta_present: float = 0.90,
    theta_half_day: float = 0.50,
) -> tuple[AttendanceDailyRecord, AttendanceExplanationTrace]:
    # Resolve shift contract from dated_shift_instances; fail with 422 if unscheduled
    if shift_contract is None:
        from app.modules.roster.repository import (
            get_dated_shift_instance_by_employee_and_date,
        )

        instance = await get_dated_shift_instance_by_employee_and_date(
            session, tenant_id, employee_id, calendar_date
        )
        if instance is not None:
            if instance.status == "CANCELLED_PAID":
                shift_contract = ShiftInstanceContract(
                    calendar_date=calendar_date,
                    shift_template_id=instance.shift_template_id,
                    dated_shift_instance_id=instance.id,
                    is_cancelled_paid=True,
                    sessions=[],
                )
            elif instance.is_rest_day or instance.status == "REST_DAY":
                shift_contract = ShiftInstanceContract(
                    calendar_date=calendar_date,
                    shift_template_id=instance.shift_template_id,
                    dated_shift_instance_id=instance.id,
                    is_rest_day=True,
                    sessions=[],
                )
            else:
                session_windows = []
                for s in instance.sessions:
                    st_val = s["start_time"]
                    et_val = s["end_time"]
                    st = time.fromisoformat(st_val) if isinstance(st_val, str) else st_val
                    et = time.fromisoformat(et_val) if isinstance(et_val, str) else et_val
                    session_windows.append(
                        SessionWindow(
                            session_order=s.get("session_order", 1),
                            start_time=st,
                            end_time=et,
                            pre_window_minutes=s.get("pre_window_minutes", 60),
                            post_window_minutes=s.get("post_window_minutes", 120),
                            min_presence_ratio=float(s.get("min_presence_ratio", 0.50)),
                            break_duration_minutes=s.get("break_duration_minutes", 0),
                            is_overnight=s.get("is_overnight", False),
                            name=s.get("name", "Session"),
                        )
                    )
                shift_contract = ShiftInstanceContract(
                    calendar_date=calendar_date,
                    shift_type="SPLIT" if len(session_windows) > 1 else ("OVERNIGHT" if any(w.is_overnight for w in session_windows) else "FIXED"),
                    shift_template_id=instance.shift_template_id,
                    dated_shift_instance_id=instance.id,
                    sessions=session_windows,
                )
        else:
            raise ProblemError(
                status=422,
                title="Unscheduled shift evaluation",
                detail=f"No scheduled shift found for employee {employee_id} on {calendar_date}. Roster materialization must be run before attendance evaluation.",
            )

    # 1. Fetch punches for 36-hour window covering the calendar date + overnight margin
    start_search, end_search = punch_search_window(calendar_date)

    punches = list(
        await list_punches_for_employee(
            session=session,
            tenant_id=tenant_id,
            employee_id=employee_id,
            start_time=start_search,
            end_time=end_search,
        )
    )

    # 2. Pair punches chronologically (BR-ATT-01, N65)
    pairing = pair_punches_for_shift(shift_contract, punches)

    # 3. Rollup decisions (N66a, N66b, Q4)
    decision = evaluate_daily_rollup(pairing, theta_present, theta_half_day)

    # 4. Build explanation trace (Invariant 4, ATT-09)
    trace_payload = build_explanation_trace(pairing, decision, theta_present, theta_half_day)

    # 5. Persist AttendanceDailyRecord
    existing = await find_attendance_record(session, tenant_id, employee_id, calendar_date)
    now = datetime.now(UTC)

    worked_ratio_decimal = Decimal(str(decision.worked_ratio))

    if existing is not None:
        existing.status = decision.status
        existing.worked_duration_minutes = decision.worked_minutes
        existing.scheduled_duration_minutes = decision.scheduled_minutes
        existing.worked_ratio = worked_ratio_decimal
        existing.late_minutes = decision.late_minutes
        existing.early_departure_minutes = decision.early_exit_minutes
        existing.overtime_minutes = decision.overtime_minutes
        existing.is_single_punch = decision.is_single_punch
        existing.anomaly_code = decision.anomaly_code
        existing.updated_at = now
        record = existing
    else:
        record = AttendanceDailyRecord(
            id=uuid4(),
            tenant_id=tenant_id,
            employee_id=employee_id,
            calendar_date=calendar_date,
            dated_shift_instance_id=shift_contract.dated_shift_instance_id,
            status=decision.status,
            worked_duration_minutes=decision.worked_minutes,
            scheduled_duration_minutes=decision.scheduled_minutes,
            worked_ratio=worked_ratio_decimal,
            late_minutes=decision.late_minutes,
            early_departure_minutes=decision.early_exit_minutes,
            overtime_minutes=decision.overtime_minutes,
            is_single_punch=decision.is_single_punch,
            anomaly_code=decision.anomaly_code,
            created_at=now,
            updated_at=now,
        )
        await save_attendance_record(session, record)

    # 6. Persist AttendanceExplanationTrace (Append-Only)
    trace = AttendanceExplanationTrace(
        id=uuid4(),
        tenant_id=tenant_id,
        attendance_record_id=record.id,
        employee_id=employee_id,
        calendar_date=calendar_date,
        trace_payload=trace_payload,
        evaluated_at=now,
    )
    await save_explanation_trace(session, trace)

    return record, trace

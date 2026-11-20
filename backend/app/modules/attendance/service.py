from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

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


async def calculate_and_save_daily_attendance(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
    shift_contract: ShiftInstanceContract | None = None,
    theta_present: float = 0.90,
    theta_half_day: float = 0.50,
) -> tuple[AttendanceDailyRecord, AttendanceExplanationTrace]:
    # Default shift: 09:00 - 18:00 fixed if not explicitly supplied
    if shift_contract is None:
        shift_contract = ShiftInstanceContract(
            calendar_date=calendar_date,
            shift_type="FIXED",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(9, 0),
                    end_time=time(18, 0),
                    pre_window_minutes=60,
                    post_window_minutes=120,
                    min_presence_ratio=0.50,
                    break_duration_minutes=0,
                    name="Standard Shift",
                )
            ],
        )

    # 1. Fetch punches for 36-hour window covering the calendar date + overnight margin
    start_search = datetime.combine(calendar_date, time(0, 0), tzinfo=UTC) - timedelta(hours=6)
    end_search = datetime.combine(calendar_date, time(23, 59, 59), tzinfo=UTC) + timedelta(hours=14)

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

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

    # 0. Resolve policy if linked to shift template
    policy = getattr(shift_contract, "policy", None)
    if policy is None and shift_contract.shift_template_id is not None:
        from app.modules.shifts.repository import get_shift_template_by_id
        tpl = await get_shift_template_by_id(session, tenant_id, shift_contract.shift_template_id)
        if tpl is not None and tpl.policy_id is not None:
            if tpl.policy is not None:
                policy = tpl.policy
            else:
                from app.modules.policies.repository import get_policy
                policy = await get_policy(session, tenant_id, tpl.policy_id)
            shift_contract.policy = policy

    # 0.05 Resolve Cascading Effective Policy (M12)
    from app.modules.policies.resolver import resolve_effective_policy
    effective_policy = await resolve_effective_policy(session, tenant_id, employee_id, base_policy=policy)

    # 0.1 Check approved work mode (WFH / ON_DUTY)
    from app.modules.work_modes.repository import list_approved_work_modes
    from app.modules.work_modes.service import work_mode_coverage

    approved_modes = await list_approved_work_modes(session, tenant_id, employee_id, calendar_date)
    work_mode_code, session_target = work_mode_coverage(approved_modes)

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
    pairing = pair_punches_for_shift(shift_contract, punches, policy=effective_policy)

    # 3. Rollup decisions (N66a, N66b, Q4, BR-ATT-17, BR-OTC-01)
    decision = evaluate_daily_rollup(
        pairing,
        theta_present,
        theta_half_day,
        policy=effective_policy,
        work_mode=work_mode_code,
        session_target=session_target,
    )

    # 3.1 Monthly Late Count & Penalty Action (BR-ATT-18 / Issue #39)
    late_penalty_info = None
    full_day_on_duty = work_mode_code == "ON_DUTY" and session_target in {None, "FULL", "BOTH"}
    if decision.late_minutes > 0 and not full_day_on_duty and policy is not None:
        from app.modules.attendance.repository import count_prior_late_days_in_month

        prior_late_count = await count_prior_late_days_in_month(
            session, tenant_id, employee_id, calendar_date
        )
        max_free = effective_policy.max_free_lates_per_month
        penalty_action = effective_policy.late_penalty_action

        exceeded = prior_late_count >= max_free
        late_penalty_info = {
            "prior_late_count": prior_late_count,
            "max_free_lates_per_month": max_free,
            "exceeded": exceeded,
            "penalty_action": penalty_action if exceeded else None,
        }
        if exceeded:
            if decision.anomaly_code is None:
                decision.anomaly_code = f"LATE_PENALTY_{penalty_action}"
            from app.modules.leave.service import post_late_penalty

            ledger_result = await post_late_penalty(
                session,
                tenant_id,
                employee_id,
                effective_policy.late_penalty_leave_type_id,
                calendar_date,
                penalty_action,
            )
            late_penalty_info["ledger_result"] = ledger_result
            decision.explanation += (
                f" Late arrival exceeded monthly allowance ({prior_late_count}/{max_free}). Action: {penalty_action}."
            )

    # 3.2 WFH extra minutes stay off the daily payable field until a supervisor acts (N20).
    # The candidate is kept for the overtime ledger below.
    candidate_ot_mins = decision.overtime_minutes or 0
    wfh_needs_supervisor = work_mode_code == "WFH" and getattr(
        effective_policy, "wfh_ot_requires_approval", True
    ) is not False
    if wfh_needs_supervisor and candidate_ot_mins > 0:
        decision.overtime_minutes = 0
        if "supervisor authorizes overtime" not in decision.explanation:
            decision.explanation += (
                " Extra minutes stay unpayable until a supervisor authorizes overtime (N20)."
            )

    # 4. Build explanation trace (Invariant 4, ATT-09)
    trace_payload = build_explanation_trace(
        pairing,
        decision,
        theta_present,
        theta_half_day,
        policy=effective_policy,
        work_mode=work_mode_code,
        session_target=session_target,
        late_penalty=late_penalty_info,
    )

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

    # 7. Overtime Record Upsert & Auto-Approval (M12)
    from app.models.overtime import OvertimeRecord
    from app.modules.overtime.repository import get_overtime_record_by_attendance_id

    existing_ot = await get_overtime_record_by_attendance_id(session, tenant_id, record.id)
    raw_ot_mins = candidate_ot_mins

    if raw_ot_mins > 0:
        ot_approval_mode = getattr(effective_policy, "ot_approval_mode", "ALWAYS_REQUIRE_APPROVAL")
        ot_threshold = getattr(effective_policy, "ot_auto_approve_threshold_minutes", 0) or 0

        if wfh_needs_supervisor:
            ot_status = "UNREVIEWED"
            approved_mins = 0
        elif ot_approval_mode == "AUTO_APPROVE_ALL":
            ot_status = "APPROVED_FOR_PAY"
            approved_mins = raw_ot_mins
        elif ot_approval_mode == "AUTO_APPROVE_BELOW_THRESHOLD" and raw_ot_mins <= ot_threshold:
            ot_status = "APPROVED_FOR_PAY"
            approved_mins = raw_ot_mins
        else:
            ot_status = "UNREVIEWED"
            approved_mins = 0

        multiplier = getattr(effective_policy, "ot_multiplier", None)
        rate_multiplier = Decimal("1.50") if multiplier is None else Decimal(str(multiplier))

        if existing_ot is not None:
            if existing_ot.status == "UNREVIEWED":
                existing_ot.raw_overtime_minutes = raw_ot_mins
                existing_ot.approved_overtime_minutes = approved_mins
                existing_ot.status = ot_status
                existing_ot.updated_at = now
        else:
            ot_rec = OvertimeRecord(
                id=uuid4(),
                tenant_id=tenant_id,
                attendance_record_id=record.id,
                employee_id=employee_id,
                overtime_date=calendar_date,
                raw_overtime_minutes=raw_ot_mins,
                approved_overtime_minutes=approved_mins,
                rate_multiplier=rate_multiplier,
                status=ot_status,
                comp_off_leave_transaction_id=None,
                supervisor_id=None,
                decision_reason="Auto-approved by policy rule" if ot_status == "APPROVED_FOR_PAY" else None,
                reviewed_at=now if ot_status == "APPROVED_FOR_PAY" else None,
                created_at=now,
                updated_at=now,
            )
            session.add(ot_rec)
            await session.flush()
    elif existing_ot is not None and existing_ot.status == "UNREVIEWED":
        existing_ot.raw_overtime_minutes = 0
        existing_ot.updated_at = now

    return record, trace

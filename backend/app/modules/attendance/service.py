from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.attendance import AttendanceDailyRecord, AttendanceExplanationTrace
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.engine.pairing import (
    pair_punches_for_shift,
    post_duty_rest_dates,
    punch_claimed_by_shift,
)
from app.modules.attendance.engine.rollup import DailyRollupDecision
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


def punch_search_window(calendar_date: date, extra_hours: int = 0) -> tuple[datetime, datetime]:
    """UTC window the daily rollup searches: 6 hours before the date through 14 hours after it.

    Continuous tours add their duty length so a 36h or 48h out punch is still visible.
    """
    start = datetime.combine(calendar_date, time(0, 0), tzinfo=UTC) - timedelta(hours=6)
    end = datetime.combine(calendar_date, time(23, 59, 59), tzinfo=UTC) + timedelta(hours=14 + extra_hours)
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
        if tpl is not None:
            shift_contract.shift_type = tpl.shift_type
            shift_contract.continuous_duty_hours = tpl.continuous_duty_hours

    # 0.05 Resolve Cascading Effective Policy (M12)
    from app.modules.policies.resolver import resolve_effective_policy
    effective_policy = await resolve_effective_policy(session, tenant_id, employee_id, base_policy=policy)

    # 0.1 Check approved work mode (WFH / ON_DUTY)
    from app.modules.work_modes.repository import list_approved_work_modes
    from app.modules.work_modes.service import work_mode_coverage

    approved_modes = await list_approved_work_modes(session, tenant_id, employee_id, calendar_date)
    work_mode_code, session_target = work_mode_coverage(approved_modes)

    cover = await _post_duty_cover(session, tenant_id, employee_id, calendar_date)

    # 1. Fetch punches for the calendar date, overnight margin, and any continuous tour
    extra_hours = 0 if cover is not None else (shift_contract.continuous_duty_hours or 0)
    start_search, end_search = punch_search_window(calendar_date, extra_hours)

    punches = list(
        await list_punches_for_employee(
            session=session,
            tenant_id=tenant_id,
            employee_id=employee_id,
            start_time=start_search,
            end_time=end_search,
        )
    )
    punches = await _drop_punches_claimed_by_earlier_shift(session, tenant_id, employee_id, calendar_date, punches)

    # 2. Pair punches chronologically (BR-ATT-01, N65)
    pairing = pair_punches_for_shift(shift_contract, [] if cover is not None else punches, policy=effective_policy)

    # 3. Rollup decisions (N66a, N66b, Q4, BR-ATT-17, BR-OTC-01)
    if cover is not None:
        commenced, duty_hours = cover
        decision = DailyRollupDecision(
            status="POST_DUTY_REST",
            worked_ratio=1.0,
            worked_minutes=0,
            scheduled_minutes=0,
            late_minutes=0,
            early_exit_minutes=0,
            overtime_minutes=0,
            is_single_punch=False,
            anomaly_code=None,
            explanation=(
                f"Post-duty rest after the {duty_hours}h continuous tour that started {commenced.isoformat()}. "
                "Full attendance credit without punches (BR-ATT-15)."
            ),
        )
    else:
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
    if (
        shift_contract.shift_type == "CONTINUOUS"
        and (shift_contract.continuous_duty_hours or 0) > 16
        and cover is None
    ):
        decision.explanation += (
            " The whole tour stays on this start date and is eligible for long-duty allowance review."
            " No allowance amount is calculated here."
        )

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
        from app.modules.policies.extra_hours_pay import decide_overtime_status, resolve_extra_hours_pay

        pay = resolve_extra_hours_pay(effective_policy)
        ot_status, approved_mins = decide_overtime_status(
            auto_enabled=getattr(effective_policy, "overtime_auto_approval_enabled", False) is True,
            mode=getattr(effective_policy, "ot_approval_mode", None),
            raw_minutes=raw_ot_mins,
            threshold_minutes=getattr(effective_policy, "ot_auto_approve_threshold_minutes", None),
            work_mode=work_mode_code,
            wfh_requires_approval=wfh_needs_supervisor,
            has_pay_rate=pay.basis != "NONE",
        )

        if pay.basis == "NONE":
            if existing_ot is not None and existing_ot.status == "UNREVIEWED":
                existing_ot.raw_overtime_minutes = raw_ot_mins
                existing_ot.approved_overtime_minutes = 0
                existing_ot.rate_multiplier = None
                existing_ot.extra_hours_amount = None
                existing_ot.extra_hours_amount_unit = None
                existing_ot.updated_at = now
        elif existing_ot is not None:
            if existing_ot.status == "UNREVIEWED":
                existing_ot.raw_overtime_minutes = raw_ot_mins
                existing_ot.approved_overtime_minutes = approved_mins
                existing_ot.rate_multiplier = pay.multiplier
                existing_ot.extra_hours_amount = pay.amount
                existing_ot.extra_hours_amount_unit = pay.unit
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
                rate_multiplier=pay.multiplier,
                extra_hours_amount=pay.amount,
                extra_hours_amount_unit=pay.unit,
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

    if cover is None:
        await _write_post_duty_rest_days(session, tenant_id, employee_id, calendar_date, shift_contract, now)

    return record, trace


def _contract_from_roster(instance: Any, template: Any) -> ShiftInstanceContract | None:
    if instance is None or template is None:
        return None
    windows: list[SessionWindow] = []
    for raw in instance.sessions or []:
        start_value = raw["start_time"]
        end_value = raw["end_time"]
        windows.append(
            SessionWindow(
                session_order=raw.get("session_order", 1),
                start_time=time.fromisoformat(start_value) if isinstance(start_value, str) else start_value,
                end_time=time.fromisoformat(end_value) if isinstance(end_value, str) else end_value,
                pre_window_minutes=raw.get("pre_window_minutes", 60),
                post_window_minutes=raw.get("post_window_minutes", 120),
                min_presence_ratio=float(raw.get("min_presence_ratio", 0.50)),
                break_duration_minutes=raw.get("break_duration_minutes", 0),
                is_overnight=raw.get("is_overnight", False),
                name=raw.get("name", "Session"),
            )
        )
    return ShiftInstanceContract(
        calendar_date=instance.calendar_date,
        shift_type=template.shift_type,
        continuous_duty_hours=template.continuous_duty_hours,
        is_rest_day=bool(instance.is_rest_day or instance.status == "REST_DAY"),
        is_cancelled_paid=instance.status == "CANCELLED_PAID",
        sessions=windows,
    )


async def _earlier_contracts(session: AsyncSession, tenant_id: UUID, employee_id: UUID, calendar_date: date):
    from app.modules.roster.repository import get_dated_shift_instance_by_employee_and_date
    from app.modules.shifts.repository import get_shift_template_by_id

    found: list[ShiftInstanceContract] = []
    for days_back in range(1, 4):
        instance = await get_dated_shift_instance_by_employee_and_date(
            session, tenant_id, employee_id, calendar_date - timedelta(days=days_back)
        )
        if instance is None or instance.shift_template_id is None:
            continue
        template = await get_shift_template_by_id(session, tenant_id, instance.shift_template_id)
        contract = _contract_from_roster(instance, template)
        if contract is not None and contract.sessions:
            found.append(contract)
    return found


async def _post_duty_cover(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> tuple[date, int] | None:
    for earlier in await _earlier_contracts(session, tenant_id, employee_id, calendar_date):
        hours = earlier.continuous_duty_hours
        if earlier.shift_type != "CONTINUOUS" or not hours or len(earlier.sessions) != 1:
            continue
        if calendar_date in post_duty_rest_dates(earlier.calendar_date, earlier.sessions[0].start_time, hours):
            return earlier.calendar_date, hours
    return None


async def _drop_punches_claimed_by_earlier_shift(session, tenant_id, employee_id, calendar_date, punches):
    earlier = await _earlier_contracts(session, tenant_id, employee_id, calendar_date)
    if not earlier:
        return punches
    return [punch for punch in punches if not any(punch_claimed_by_shift(punch.punch_time, shift) for shift in earlier)]


async def _write_post_duty_rest_days(session, tenant_id, employee_id, calendar_date, shift_contract, now):
    hours = shift_contract.continuous_duty_hours
    if shift_contract.shift_type != "CONTINUOUS" or not hours or len(shift_contract.sessions) != 1:
        return
    for rest_date in post_duty_rest_dates(calendar_date, shift_contract.sessions[0].start_time, hours):
        existing = await find_attendance_record(session, tenant_id, employee_id, rest_date)
        if existing is not None and existing.status != "ABSENT":
            continue
        explanation = (
            f"Post-duty rest after the {hours}h continuous tour that started {calendar_date.isoformat()}. "
            "Full attendance credit without punches (BR-ATT-15)."
        )
        if existing is None:
            existing = AttendanceDailyRecord(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=employee_id,
                calendar_date=rest_date,
                dated_shift_instance_id=None,
                status="POST_DUTY_REST",
                worked_duration_minutes=0,
                scheduled_duration_minutes=0,
                worked_ratio=Decimal("1.0000"),
                late_minutes=0,
                early_departure_minutes=0,
                overtime_minutes=0,
                is_single_punch=False,
                anomaly_code=None,
                created_at=now,
                updated_at=now,
            )
            await save_attendance_record(session, existing)
        else:
            existing.status = "POST_DUTY_REST"
            existing.worked_ratio = Decimal("1.0000")
            existing.overtime_minutes = 0
            existing.is_single_punch = False
            existing.anomaly_code = None
            existing.updated_at = now
        await save_explanation_trace(
            session,
            AttendanceExplanationTrace(
                id=uuid4(),
                tenant_id=tenant_id,
                attendance_record_id=existing.id,
                employee_id=employee_id,
                calendar_date=rest_date,
                trace_payload={"rule": "BR-ATT-15", "status": "POST_DUTY_REST", "explanation": explanation},
                evaluated_at=now,
            ),
        )

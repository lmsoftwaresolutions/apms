from dataclasses import dataclass

from app.modules.attendance.engine.pairing import DailyPairingResult


@dataclass
class DailyRollupDecision:
    status: str  # PRESENT, HALF_DAY, ABSENT, NEEDS_REVIEW, REST_DAY
    worked_ratio: float
    worked_minutes: int
    scheduled_minutes: int
    late_minutes: int
    early_exit_minutes: int
    overtime_minutes: int
    is_single_punch: bool
    anomaly_code: str | None
    explanation: str


def evaluate_daily_rollup(
    pairing: DailyPairingResult,
    theta_present: float = 0.90,
    theta_half_day: float = 0.50,
    policy: object | None = None,
    work_mode: str | None = None,
) -> DailyRollupDecision:
    # 1. Employer-cancelled session (N66d / ROS-10)
    if pairing.is_cancelled_paid:
        return DailyRollupDecision(
            status="PRESENT",
            worked_ratio=1.0,
            worked_minutes=pairing.total_scheduled_minutes,
            scheduled_minutes=pairing.total_scheduled_minutes,
            late_minutes=0,
            early_exit_minutes=0,
            overtime_minutes=0,
            is_single_punch=False,
            anomaly_code=None,
            explanation="Employer-cancelled session credited as PRESENT per N66d",
        )

    # 2. Rest Day / Weekly Off
    if pairing.is_rest_day:
        return DailyRollupDecision(
            status="REST_DAY",
            worked_ratio=0.0,
            worked_minutes=0,
            scheduled_minutes=0,
            late_minutes=0,
            early_exit_minutes=0,
            overtime_minutes=0,
            is_single_punch=False,
            anomaly_code=None,
            explanation="Scheduled rest day",
        )

    # 2.5 On-Duty Work Mode (BR-ATT-17 / Issue #39)
    if work_mode == "ON_DUTY":
        sched = pairing.total_scheduled_minutes if pairing.total_scheduled_minutes > 0 else 480
        return DailyRollupDecision(
            status="PRESENT",
            worked_ratio=1.0,
            worked_minutes=sched,
            scheduled_minutes=sched,
            late_minutes=0,
            early_exit_minutes=0,
            overtime_minutes=0,
            is_single_punch=False,
            anomaly_code=None,
            explanation="On-Duty work mode credited as PRESENT without biometric punch requirement per BR-ATT-17",
        )

    # 3. Single-Punch Anomaly (Q4 / BR-ATT-04 / BR-ATT-16)
    if pairing.total_punches_matched == 1 or pairing.has_single_punch or (len(pairing.sessions) == 1 and pairing.sessions[0].is_single_punch):
        return DailyRollupDecision(
            status="NEEDS_REVIEW",
            worked_ratio=0.0,
            worked_minutes=0,
            scheduled_minutes=pairing.total_scheduled_minutes,
            late_minutes=pairing.total_late_minutes,
            early_exit_minutes=pairing.total_early_exit_minutes,
            overtime_minutes=0,  # Never auto-grant OT from lone punch
            is_single_punch=True,
            anomaly_code="LONE_PUNCH_ANOMALY",
            explanation="Single or unpaired punch recorded for shift session. Defaults to NEEDS_REVIEW per Q4.",
        )

    # 4. Zero punches matched
    if pairing.total_punches_matched == 0 or pairing.total_worked_minutes == 0:
        return DailyRollupDecision(
            status="ABSENT",
            worked_ratio=0.0,
            worked_minutes=0,
            scheduled_minutes=pairing.total_scheduled_minutes,
            late_minutes=0,
            early_exit_minutes=0,
            overtime_minutes=0,
            is_single_punch=False,
            anomaly_code=None,
            explanation="No valid punches recorded for scheduled shift.",
        )

    # 5. Severe Late Arrival Cutoff: if late_minutes >= absent_late_cutoff_minutes -> ABSENT
    absent_late_cutoff = getattr(policy, "absent_late_cutoff_minutes", None) if policy else None
    if absent_late_cutoff is not None and pairing.total_late_minutes >= absent_late_cutoff:
        return DailyRollupDecision(
            status="ABSENT",
            worked_ratio=round(pairing.total_worked_minutes / max(1, pairing.total_scheduled_minutes), 4),
            worked_minutes=pairing.total_worked_minutes,
            scheduled_minutes=pairing.total_scheduled_minutes,
            late_minutes=pairing.total_late_minutes,
            early_exit_minutes=pairing.total_early_exit_minutes,
            overtime_minutes=0,
            is_single_punch=False,
            anomaly_code="SEVERE_LATE_ABSENT",
            explanation=f"Marked ABSENT: late arrival ({pairing.total_late_minutes}m) exceeded cutoff ({absent_late_cutoff}m).",
        )

    # 6. DURATION_RATIO & Work Duration Thresholds (N66a)
    sched = max(1, pairing.total_scheduled_minutes)
    ratio = round(pairing.total_worked_minutes / sched, 4)

    full_day_mins = getattr(policy, "full_day_work_duration_minutes", None) if policy else None
    half_day_mins = getattr(policy, "half_day_work_duration_minutes", None) if policy else None

    if full_day_mins is not None and half_day_mins is not None:
        # A linked policy uses only the hours the tenant configured.
        if pairing.total_worked_minutes >= full_day_mins:
            tentative_status = "PRESENT"
        elif pairing.total_worked_minutes >= half_day_mins:
            tentative_status = "HALF_DAY"
        else:
            tentative_status = "ABSENT"
        explanation = (
            f"Worked {pairing.total_worked_minutes} minutes against policy hours "
            f"{half_day_mins} half day and {full_day_mins} present."
        )
    else:
        if ratio >= theta_present:
            tentative_status = "PRESENT"
        elif ratio >= theta_half_day:
            tentative_status = "HALF_DAY"
        else:
            tentative_status = "ABSENT"
        explanation = f"Rollup ratio {ratio:.2%} evaluated against bands."

    # 7. Late Arrival Half Day Cutoff: if late_minutes >= half_day_late_cutoff_minutes -> cap at HALF_DAY
    half_day_late_cutoff = getattr(policy, "half_day_late_cutoff_minutes", None) if policy else None
    if half_day_late_cutoff is not None and pairing.total_late_minutes >= half_day_late_cutoff:
        if tentative_status == "PRESENT":
            tentative_status = "HALF_DAY"
            explanation += f" Capped at HALF_DAY: late arrival ({pairing.total_late_minutes}m) exceeded cutoff ({half_day_late_cutoff}m)."

    # 8. Session Minimum-Presence Eligibility Cap (Confirmed N66b)
    # In a multi-session split shift, if an employee is BELOW_MIN or absent for one full session,
    # daily status is strictly capped at HALF_DAY!
    status_cap_applied = False
    if len(pairing.sessions) >= 2:
        for s in pairing.sessions:
            if s.status == "BELOW_MIN" and tentative_status == "PRESENT":
                tentative_status = "HALF_DAY"
                status_cap_applied = True
                break

    if status_cap_applied:
        explanation += " Capped at HALF_DAY because one or more split sessions were BELOW_MIN per N66b."

    # 9. Overtime calculation with policy minimum qualifier & daily cap
    extra_minutes = max(0, pairing.total_worked_minutes - pairing.total_scheduled_minutes)
    ot_minimum = getattr(policy, "ot_minimum_minutes", 0) if policy else 0
    if ot_minimum is None:
        ot_minimum = 0

    if extra_minutes >= ot_minimum:
        ot_minutes = extra_minutes
    else:
        ot_minutes = 0

    max_ot = getattr(policy, "max_ot_minutes_per_day", None) if policy else None
    if max_ot is not None:
        ot_minutes = min(ot_minutes, max_ot)

    # WFH Overtime Suppression (BR-OTC-01 / Confirmed N20)
    allow_wfh_ot = getattr(policy, "allow_wfh_overtime", False) if policy else False
    if work_mode == "WFH" and not allow_wfh_ot and ot_minutes > 0:
        ot_minutes = 0
        explanation += " Overtime suppressed during WFH per policy BR-OTC-01."

    return DailyRollupDecision(
        status=tentative_status,
        worked_ratio=ratio,
        worked_minutes=pairing.total_worked_minutes,
        scheduled_minutes=pairing.total_scheduled_minutes,
        late_minutes=pairing.total_late_minutes,
        early_exit_minutes=pairing.total_early_exit_minutes,
        overtime_minutes=ot_minutes,
        is_single_punch=False,
        anomaly_code=None,
        explanation=explanation,
    )

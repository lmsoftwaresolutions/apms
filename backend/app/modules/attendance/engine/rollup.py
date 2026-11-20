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

    # 3. Single-Punch Anomaly (Q4 / BR-ATT-04 / BR-ATT-16)
    if pairing.total_punches_matched == 1 or (len(pairing.sessions) == 1 and pairing.sessions[0].is_single_punch):
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
            explanation="Only a single punch recorded for the shift. Defaults to NEEDS_REVIEW per Q4.",
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

    # 5. DURATION_RATIO calculation: R = Worked / Scheduled (N66a)
    sched = max(1, pairing.total_scheduled_minutes)
    ratio = round(pairing.total_worked_minutes / sched, 4)

    # Base status from policy bands
    if ratio >= theta_present:
        tentative_status = "PRESENT"
    elif ratio >= theta_half_day:
        tentative_status = "HALF_DAY"
    else:
        tentative_status = "ABSENT"

    # 6. Session Minimum-Presence Eligibility Cap (Confirmed N66b)
    # In a multi-session split shift, if an employee is BELOW_MIN or absent for one full session,
    # daily status is strictly capped at HALF_DAY!
    status_cap_applied = False
    if len(pairing.sessions) >= 2:
        for s in pairing.sessions:
            if s.status == "BELOW_MIN" and tentative_status == "PRESENT":
                tentative_status = "HALF_DAY"
                status_cap_applied = True
                break

    # Overtime calculation: extra time beyond scheduled shift
    ot_minutes = max(0, pairing.total_worked_minutes - pairing.total_scheduled_minutes)

    explanation = f"Rollup ratio {ratio:.2%} evaluated against bands."
    if status_cap_applied:
        explanation += " Capped at HALF_DAY because one or more split sessions were BELOW_MIN per N66b."

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

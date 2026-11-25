from datetime import UTC, datetime
from typing import Any

from app.modules.attendance.engine.pairing import DailyPairingResult
from app.modules.attendance.engine.rollup import DailyRollupDecision


def _trace_number(value: object) -> float | None:
    if value is None:
        return None
    return float(str(value))


def build_explanation_trace(
    pairing: DailyPairingResult,
    decision: DailyRollupDecision,
    theta_present: float = 0.90,
    theta_half_day: float = 0.50,
    policy: object | None = None,
    work_mode: str | None = None,
    session_target: str | None = None,
    late_penalty: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Generates immutable JSON audit trace payload per Invariant 4 and ATT-09."""

    session_traces = []
    for s in pairing.sessions:
        session_traces.append(
            {
                "session_order": s.session_order,
                "session_name": s.session_name,
                "scheduled_start": s.scheduled_start.isoformat(),
                "scheduled_end": s.scheduled_end.isoformat(),
                "scheduled_minutes": s.scheduled_minutes,
                "window_start": s.window_start.isoformat(),
                "window_end": s.window_end.isoformat(),
                "matched_punches_count": len(s.matched_punches),
                "in_punch": s.in_punch.isoformat() if s.in_punch else None,
                "out_punch": s.out_punch.isoformat() if s.out_punch else None,
                "worked_minutes": s.worked_minutes,
                "break_minutes_deducted": s.break_minutes,
                "late_minutes": s.late_minutes,
                "early_exit_minutes": s.early_exit_minutes,
                "session_eligibility": s.status,  # COMPLETED or BELOW_MIN
            }
        )

    applied_policy_trace = None
    if policy is not None:
        applied_policy_trace = {
            "policy_id": str(getattr(policy, "id", None)) if getattr(policy, "id", None) else None,
            "code": getattr(policy, "code", None),
            "name": getattr(policy, "name", None),
            "late_arrival_allow_minutes": getattr(policy, "late_arrival_allow_minutes", 0),
            "early_departure_allow_minutes": getattr(policy, "early_departure_allow_minutes", 0),
            "half_day_work_duration_minutes": getattr(policy, "half_day_work_duration_minutes", 240),
            "full_day_work_duration_minutes": getattr(policy, "full_day_work_duration_minutes", 480),
            "half_day_late_cutoff_minutes": getattr(policy, "half_day_late_cutoff_minutes", None),
            "absent_late_cutoff_minutes": getattr(policy, "absent_late_cutoff_minutes", None),
            "ot_minimum_minutes": getattr(policy, "ot_minimum_minutes", 30),
            "ot_multiplier": _trace_number(getattr(policy, "ot_multiplier", None)),
            "extra_hours_amount": _trace_number(getattr(policy, "extra_hours_amount", None)),
            "extra_hours_amount_unit": getattr(policy, "extra_hours_amount_unit", None),
            "wfh_monthly_auto_quota": getattr(policy, "wfh_monthly_auto_quota", 4),
            "allow_wfh_overtime": getattr(policy, "allow_wfh_overtime", False),
            "ot_approval_mode": getattr(policy, "ot_approval_mode", "ALWAYS_REQUIRE_APPROVAL"),
            "max_free_lates_per_month": getattr(policy, "max_free_lates_per_month", 3),
            "late_penalty_action": getattr(policy, "late_penalty_action", "WARNING"),
        }

    return {
        "engine_version": "v1.0",
        "evaluated_at": datetime.now(UTC).isoformat(),
        "calendar_date": pairing.calendar_date,
        "work_mode": work_mode,
        "session_target": session_target,
        "is_on_duty_waived": work_mode == "ON_DUTY",
        "wfh_ot_suppressed": work_mode == "WFH",
        "late_penalty": late_penalty,
        "policy_bands": {
            "theta_present": theta_present,
            "theta_half_day": theta_half_day,
            "mode": "DURATION_RATIO",
        },
        "applied_policy": applied_policy_trace,
        "sessions": session_traces,
        "summary": {
            "total_scheduled_minutes": pairing.total_scheduled_minutes,
            "total_worked_minutes": pairing.total_worked_minutes,
            "mid_gap_minutes_excluded": pairing.mid_gap_minutes_excluded,  # N65 gap
            "worked_ratio": decision.worked_ratio,
            "total_late_minutes": decision.late_minutes,
            "total_early_exit_minutes": decision.early_exit_minutes,
            "overtime_minutes": decision.overtime_minutes,
            "is_single_punch": decision.is_single_punch,
            "anomaly_code": decision.anomaly_code,
            "assigned_status": decision.status,
            "explanation": decision.explanation,
        },
    }

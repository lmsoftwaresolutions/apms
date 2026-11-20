from datetime import UTC, datetime
from typing import Any

from app.modules.attendance.engine.pairing import DailyPairingResult
from app.modules.attendance.engine.rollup import DailyRollupDecision


def build_explanation_trace(
    pairing: DailyPairingResult,
    decision: DailyRollupDecision,
    theta_present: float = 0.90,
    theta_half_day: float = 0.50,
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

    return {
        "engine_version": "v1.0",
        "evaluated_at": datetime.now(UTC).isoformat(),
        "calendar_date": pairing.calendar_date,
        "policy_bands": {
            "theta_present": theta_present,
            "theta_half_day": theta_half_day,
            "mode": "DURATION_RATIO",
        },
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

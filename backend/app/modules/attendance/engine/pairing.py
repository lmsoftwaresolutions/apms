from dataclasses import dataclass, field
from datetime import UTC, datetime, time, timedelta
from zoneinfo import ZoneInfo

from app.models.punch import PunchEvent
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract

IST = ZoneInfo("Asia/Kolkata")


@dataclass
class SessionPairingResult:
    session_order: int
    session_name: str
    scheduled_start: datetime
    scheduled_end: datetime
    scheduled_minutes: int
    window_start: datetime
    window_end: datetime
    matched_punches: list[datetime] = field(default_factory=list)
    in_punch: datetime | None = None
    out_punch: datetime | None = None
    worked_minutes: int = 0
    break_minutes: int = 0
    late_minutes: int = 0
    early_exit_minutes: int = 0
    is_single_punch: bool = False
    status: str = "BELOW_MIN"  # COMPLETED, BELOW_MIN


@dataclass
class DailyPairingResult:
    calendar_date: str
    is_rest_day: bool
    is_cancelled_paid: bool
    sessions: list[SessionPairingResult] = field(default_factory=list)
    total_scheduled_minutes: int = 0
    total_worked_minutes: int = 0
    total_late_minutes: int = 0
    total_early_exit_minutes: int = 0
    mid_gap_minutes_excluded: int = 0  # N65 gap
    total_punches_matched: int = 0
    has_single_punch: bool = False


def _combine_date_time_utc(d, t: time, is_next_day: bool = False) -> datetime:
    base_date = d + timedelta(days=1) if is_next_day else d
    dt_local = datetime.combine(base_date, t, tzinfo=IST)
    return dt_local.astimezone(UTC)


def _policy_int(policy: object | None, name: str) -> int:
    value = getattr(policy, name, 0) if policy else 0
    return 0 if value is None else int(value)


def _clamped_minutes(
    start: datetime,
    end: datetime,
    scheduled_start: datetime,
    scheduled_end: datetime,
    early_ignore: int,
    late_ignore: int,
) -> int:
    """Duration inside the early-arrival and late-departure ignore windows.

    The punch timestamps themselves stay at the recorded times. A deviation of
    ignore minutes or less is left out of duration and overtime. A larger
    deviation counts in full: the ignore allowance is not subtracted from it.
    A zero ignore window leaves every early or late minute in the duration.
    """
    effective_start = start
    if start < scheduled_start and (scheduled_start - start) <= timedelta(minutes=early_ignore):
        effective_start = scheduled_start
    effective_end = end
    if end > scheduled_end and (end - scheduled_end) <= timedelta(minutes=late_ignore):
        effective_end = scheduled_end
    if effective_end <= effective_start:
        return 0
    return int((effective_end - effective_start).total_seconds() / 60)


def pair_punches_for_shift(
    shift: ShiftInstanceContract,
    punches: list[PunchEvent],
    policy: object | None = None,
) -> DailyPairingResult:
    cal_date = shift.calendar_date
    result = DailyPairingResult(
        calendar_date=cal_date.isoformat(),
        is_rest_day=shift.is_rest_day,
        is_cancelled_paid=shift.is_cancelled_paid,
    )

    if shift.is_rest_day or shift.is_cancelled_paid:
        return result

    pol = policy or getattr(shift, "policy", None)
    late_grace = _policy_int(pol, "late_arrival_allow_minutes")
    early_grace = _policy_int(pol, "early_departure_allow_minutes")
    early_ignore = _policy_int(pol, "early_arrival_ignore_minutes")
    late_ignore = _policy_int(pol, "late_departure_ignore_minutes")
    in_out_rule = getattr(pol, "in_out_rule", "FIRST_IN_LAST_OUT") if pol else "FIRST_IN_LAST_OUT"
    if in_out_rule not in {"FIRST_IN_LAST_OUT", "ALL_IN_OUT"}:
        in_out_rule = "FIRST_IN_LAST_OUT"

    # Sort punches chronologically
    active_punches = [p for p in punches if p.status == "ACTIVE"]
    active_punches.sort(key=lambda p: p.punch_time)

    # Convert punches to UTC datetimes
    punch_times = [p.punch_time.astimezone(UTC) for p in active_punches]

    total_sched = 0
    total_worked = 0
    total_late = 0
    total_early = 0
    all_matched_punches = set()

    sorted_sessions = sorted(shift.sessions, key=lambda s: s.session_order)

    for idx, s in enumerate(sorted_sessions):
        # Scheduled Start & End
        sched_start_utc = _combine_date_time_utc(cal_date, s.start_time)
        is_end_next_day = s.is_overnight or (s.end_time < s.start_time)
        sched_end_utc = _combine_date_time_utc(cal_date, s.end_time, is_next_day=is_end_next_day)

        sched_mins = max(0, int((sched_end_utc - sched_start_utc).total_seconds() / 60) - s.break_duration_minutes)
        total_sched += sched_mins

        # Session Ingestion Window: [T_start - W_pre, T_end + W_post] (BR-ATT-01)
        win_start = sched_start_utc - timedelta(minutes=s.pre_window_minutes)
        win_end = sched_end_utc + timedelta(minutes=s.post_window_minutes)

        next_start = None
        if idx + 1 < len(sorted_sessions):
            nxt = sorted_sessions[idx + 1]
            next_start = _combine_date_time_utc(cal_date, nxt.start_time)
        prev_end = result.sessions[idx - 1].scheduled_end if idx else None

        matched = []
        for pt in punch_times:
            if not (win_start <= pt <= win_end):
                continue
            # N65: a punch strictly inside the scheduled gap is not a session boundary.
            if next_start is not None and sched_end_utc < pt < next_start:
                continue
            if prev_end is not None and prev_end < pt < sched_start_utc:
                continue
            matched.append(pt)
        for m in matched:
            all_matched_punches.add(m)

        session_res = SessionPairingResult(
            session_order=s.session_order,
            session_name=s.name,
            scheduled_start=sched_start_utc,
            scheduled_end=sched_end_utc,
            scheduled_minutes=sched_mins,
            window_start=win_start,
            window_end=win_end,
            matched_punches=matched,
            break_minutes=s.break_duration_minutes,
        )

        if len(matched) == 0:
            session_res.status = "BELOW_MIN"
            session_res.worked_minutes = 0
        elif len(matched) == 1:
            session_res.is_single_punch = True
            session_res.in_punch = matched[0]
            session_res.worked_minutes = 0
            session_res.status = "BELOW_MIN"
        else:
            # FIRST_IN_LAST_OUT spans the first and last punch (BR-ATT-01).
            # ALL_IN_OUT sums every in/out pair and drops the gaps between them.
            first_p = matched[0]
            last_p = matched[-1]
            session_res.in_punch = first_p
            session_res.out_punch = last_p
            if in_out_rule == "ALL_IN_OUT":
                raw_duration = 0
                pairs: list[tuple[datetime, datetime]] = []
                for pair_index in range(0, len(matched) - 1, 2):
                    pair_start = matched[pair_index]
                    pair_end = matched[pair_index + 1]
                    pairs.append((pair_start, pair_end))
                    raw_duration += _clamped_minutes(
                        pair_start,
                        pair_end,
                        sched_start_utc,
                        sched_end_utc,
                        early_ignore,
                        late_ignore,
                    )
                # Gaps between pairs are already out of raw_duration. Subtract only
                # the scheduled break those gaps have not already covered.
                punched_gap = 0
                for previous, following in zip(pairs, pairs[1:], strict=False):
                    gap_seconds = (following[0] - previous[1]).total_seconds()
                    if gap_seconds > 0:
                        punched_gap += int(gap_seconds / 60)
                unpaid_break = max(0, s.break_duration_minutes - punched_gap)
            else:
                raw_duration = _clamped_minutes(
                    first_p,
                    last_p,
                    sched_start_utc,
                    sched_end_utc,
                    early_ignore,
                    late_ignore,
                )
                unpaid_break = s.break_duration_minutes
            net_worked = max(0, raw_duration - unpaid_break)
            session_res.worked_minutes = net_worked
            if in_out_rule == "ALL_IN_OUT" and len(matched) % 2 == 1:
                session_res.is_single_punch = True

            # Late calculation
            if first_p > sched_start_utc:
                diff_late = int((first_p - sched_start_utc).total_seconds() / 60)
                session_res.late_minutes = diff_late if diff_late > late_grace else 0

            # Early exit calculation
            if last_p < sched_end_utc:
                diff_early = int((sched_end_utc - last_p).total_seconds() / 60)
                session_res.early_exit_minutes = diff_early if diff_early > early_grace else 0

            # Minimum presence evaluation (N66b)
            min_required = int(s.min_presence_ratio * sched_mins)
            if net_worked >= min_required:
                session_res.status = "COMPLETED"
            else:
                session_res.status = "BELOW_MIN"

        total_worked += session_res.worked_minutes
        total_late += session_res.late_minutes
        total_early += session_res.early_exit_minutes
        result.sessions.append(session_res)

    # N65 Mid-Shift Gap Exclusion:
    # If multi-session (e.g. 2 sessions), the interval [Session1_End, Session2_Start] is explicitly excluded!
    if len(sorted_sessions) >= 2:
        for i in range(len(sorted_sessions) - 1):
            s1 = result.sessions[i]
            s2 = result.sessions[i + 1]
            gap_seconds = (s2.scheduled_start - s1.scheduled_end).total_seconds()
            if gap_seconds > 0:
                result.mid_gap_minutes_excluded += int(gap_seconds / 60)

    result.total_scheduled_minutes = total_sched
    result.total_worked_minutes = total_worked
    result.total_late_minutes = total_late
    result.total_early_exit_minutes = total_early
    result.total_punches_matched = len(all_matched_punches)
    result.has_single_punch = len(all_matched_punches) == 1 or any(s.is_single_punch for s in result.sessions)

    return result


def _retotal(result: DailyPairingResult) -> None:
    result.total_worked_minutes = sum(s.worked_minutes for s in result.sessions)
    result.total_late_minutes = sum(s.late_minutes for s in result.sessions)
    result.total_early_exit_minutes = sum(s.early_exit_minutes for s in result.sessions)
    result.has_single_punch = result.total_punches_matched == 1 or any(s.is_single_punch for s in result.sessions)


def apply_session_waiver(result: DailyPairingResult, session_target: str) -> None:
    """Credit the targeted half without turning the rest of the day into time worked.

    One session: FIRST_HALF and SECOND_HALF each credit half of that session.
    Two sessions: FIRST_HALF credits session 1 and SECOND_HALF credits session 2.
    BOTH credits every session.
    """
    if session_target not in {"FIRST_HALF", "SECOND_HALF", "BOTH"} or not result.sessions:
        return
    if len(result.sessions) == 1:
        session = result.sessions[0]
        credit = session.scheduled_minutes if session_target == "BOTH" else session.scheduled_minutes // 2
        session.worked_minutes = max(session.worked_minutes, credit)
        if session.worked_minutes >= int(session.scheduled_minutes * 0.5):
            session.status = "COMPLETED"
            session.is_single_punch = False
    else:
        if session_target == "FIRST_HALF":
            chosen = {result.sessions[0].session_order}
        elif session_target == "SECOND_HALF":
            chosen = {result.sessions[-1].session_order}
        else:
            chosen = {s.session_order for s in result.sessions}
        for session in result.sessions:
            if session.session_order not in chosen:
                continue
            session.worked_minutes = max(session.worked_minutes, session.scheduled_minutes)
            session.late_minutes = 0
            session.early_exit_minutes = 0
            session.is_single_punch = False
            session.status = "COMPLETED"
    _retotal(result)

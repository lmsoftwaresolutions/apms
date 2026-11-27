"""Continuous tours and punches already claimed by an earlier shift."""

from datetime import UTC, date, datetime, time, timedelta
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.engine.pairing import (
    pair_punches_for_shift,
    post_duty_rest_dates,
    punch_claimed_by_shift,
)

IST = ZoneInfo("Asia/Kolkata")


def _punch(moment: datetime):
    return SimpleNamespace(status="ACTIVE", punch_time=moment.astimezone(UTC))


def test_post_duty_rest_dates_follow_the_tour():
    start = date(2026, 11, 2)
    assert post_duty_rest_dates(start, time(8, 0), 24) == [date(2026, 11, 3), date(2026, 11, 4)]
    assert post_duty_rest_dates(start, time(8, 0), 36) == [date(2026, 11, 3), date(2026, 11, 4)]
    assert post_duty_rest_dates(start, time(8, 0), 48) == [
        date(2026, 11, 3),
        date(2026, 11, 4),
        date(2026, 11, 5),
    ]


def test_continuous_tour_credits_the_whole_span_to_the_start_date():
    started = date(2026, 11, 2)
    contract = ShiftInstanceContract(
        calendar_date=started,
        shift_type="CONTINUOUS",
        continuous_duty_hours=36,
        sessions=[
            SessionWindow(
                session_order=1,
                start_time=time(8, 0),
                end_time=time(20, 0),
                break_duration_minutes=60,
                pre_window_minutes=60,
                post_window_minutes=120,
            )
        ],
    )
    inn = datetime(2026, 11, 2, 8, 0, tzinfo=IST)
    out = inn + timedelta(hours=36)
    result = pair_punches_for_shift(contract, [_punch(inn), _punch(out)])
    assert result.total_worked_minutes == 36 * 60 - 60
    assert result.sessions[0].in_punch == inn.astimezone(UTC)
    assert result.sessions[0].out_punch == out.astimezone(UTC)
    assert result.has_single_punch is False


def test_next_morning_out_punch_stays_with_the_overnight_shift():
    commenced = date(2026, 3, 31)
    overnight = ShiftInstanceContract(
        calendar_date=commenced,
        shift_type="OVERNIGHT",
        sessions=[
            SessionWindow(
                session_order=1,
                start_time=time(22, 0),
                end_time=time(6, 0),
                is_overnight=True,
                post_window_minutes=60,
                pre_window_minutes=60,
            )
        ],
    )
    morning_out = datetime(2026, 4, 1, 6, 0, tzinfo=IST)
    later_in = datetime(2026, 4, 1, 9, 0, tzinfo=IST)
    assert punch_claimed_by_shift(morning_out, overnight) is True
    assert punch_claimed_by_shift(later_in, overnight) is False

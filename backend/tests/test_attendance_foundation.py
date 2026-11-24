from datetime import UTC, date, datetime, timedelta
from pathlib import Path

import pytest

from app.core.errors import ProblemError
from app.modules.attendance.cutoff import LOOKBACK_DAYS, cutoff_utc, evaluation_is_current, is_due, ist_today
from app.modules.privacy.service import consent_action
from app.modules.punches.service import punch_status_for_consent
from app.modules.regularizations.service import assert_inside_day, required_punches
from edge_agent.buffer import PunchBuffer


def test_consent_action_records_only_a_change() -> None:
    assert consent_action(False, True) == "GRANTED"
    assert consent_action(True, False) == "WITHDRAWN"
    assert consent_action(True, True) is None
    assert consent_action(False, None) is None


def test_regularization_requires_the_missing_side() -> None:
    with pytest.raises(ProblemError) as missing_in:
        required_punches("MISSED_IN", None, datetime(2026, 11, 23, 12, 30, tzinfo=UTC))
    assert missing_in.value.status == 422
    required_punches("BOTH", datetime(2026, 11, 23, 3, 30, tzinfo=UTC), datetime(2026, 11, 23, 12, 30, tzinfo=UTC))


def test_cutoff_waits_for_the_overnight_post_window() -> None:
    sessions = [
        {
            "session_order": 1,
            "start_time": "22:00:00",
            "end_time": "06:00:00",
            "is_overnight": True,
            "post_window_minutes": 60,
        }
    ]
    day = datetime(2026, 12, 31, tzinfo=UTC).date()
    cutoff = cutoff_utc(day, sessions)
    assert cutoff is not None
    before = cutoff - timedelta(minutes=1)
    after = cutoff + timedelta(minutes=1)
    assert is_due(day, sessions, before, False) is False
    assert is_due(day, sessions, after, False) is True
    assert is_due(day, sessions, after, True) is False


def test_ist_today_and_cutoff_skip_a_current_day() -> None:
    now = datetime(2026, 11, 23, 20, 0, tzinfo=UTC)
    assert ist_today(now).isoformat() == "2026-11-24"
    evaluated = datetime(2026, 11, 24, 2, 0, tzinfo=UTC)
    assert evaluation_is_current(evaluated, None) is True
    assert evaluation_is_current(evaluated, evaluated) is True
    assert evaluation_is_current(evaluated, evaluated + timedelta(minutes=1)) is False
    assert evaluation_is_current(None, None) is False


def test_correction_punch_must_fall_inside_the_day_window() -> None:
    day = date(2026, 11, 24)
    assert_inside_day(day, datetime(2026, 11, 24, 10, 0, tzinfo=UTC))
    with pytest.raises(ProblemError) as outside:
        assert_inside_day(day, datetime(2026, 11, 23, 17, 0, tzinfo=UTC))
    assert outside.value.status == 422
    assert LOOKBACK_DAYS >= 7


def test_withdrawn_consent_rejects_biometric_and_keeps_the_alternate_path() -> None:
    assert punch_status_for_consent("ZKTECO", True, False) == "CONSENT_WITHDRAWN"
    assert punch_status_for_consent("ZKTECO", False, False) == "ACTIVE"
    assert punch_status_for_consent("CSV_BULK", True, False) == "ACTIVE"
    assert punch_status_for_consent("ZKTECO", False, True) == "DUPLICATE_IGNORED"
    assert punch_status_for_consent("ETIMEOFFICE", True, True) == "CONSENT_WITHDRAWN"


def test_edge_buffer_keeps_seven_days_and_uploads_once(tmp_path: Path) -> None:
    buffer = PunchBuffer(tmp_path / "punches.sqlite")
    now = datetime(2026, 11, 24, 12, 0, tzinfo=UTC)
    first = buffer.enqueue('{"employee":"A"}', queued_at=now - timedelta(days=8))
    second = buffer.enqueue('{"employee":"B"}', queued_at=now)
    assert [row[0] for row in buffer.pending()] == [first, second]
    buffer.mark_uploaded(first, uploaded_at=now - timedelta(days=8))
    assert buffer.sweep(now) == 1
    assert [row[0] for row in buffer.pending()] == [second]
    buffer.close()

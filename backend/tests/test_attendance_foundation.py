from datetime import UTC, datetime, timedelta
from pathlib import Path

import pytest

from app.core.errors import ProblemError
from app.modules.attendance.cutoff import cutoff_utc, is_due
from app.modules.privacy.service import consent_action
from app.modules.regularizations.service import required_punches
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

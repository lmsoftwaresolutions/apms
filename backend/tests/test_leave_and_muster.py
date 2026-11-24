from datetime import date
from decimal import Decimal
from uuid import uuid4

import pytest

from app.modules.leave.ledger import balance, request_span, sandwiched_dates, split_shortfall
from app.modules.muster.rows import muster_lines


def test_balance_is_the_sum_of_the_ledger() -> None:
    entries = [
        ("ACCRUAL", Decimal("12")),
        ("DEBIT", Decimal("1.5")),
        ("LOP", Decimal("0.5")),
        ("LAPSE", Decimal("1")),
        ("CREDIT", Decimal("0.5")),
    ]
    assert balance(entries) == Decimal("10.0")


def test_shortfall_becomes_loss_of_pay_unless_advance_is_allowed() -> None:
    assert split_shortfall(Decimal("1"), Decimal("2.5"), False) == (Decimal("1"), Decimal("1.5"))
    assert split_shortfall(Decimal("0"), Decimal("1"), False) == (Decimal("0"), Decimal("1"))
    assert split_shortfall(Decimal("1"), Decimal("2.5"), True) == (Decimal("2.5"), Decimal("0"))


def test_half_day_is_one_session_and_a_full_span_counts_inclusive_dates() -> None:
    day = date(2026, 11, 24)
    assert request_span(day, day, "FIRST_HALF") == Decimal("0.5")
    assert request_span(day, date(2026, 11, 26), "FULL") == Decimal("3")
    with pytest.raises(ValueError):
        request_span(day, date(2026, 11, 25), "SECOND_HALF")


def test_sandwich_converts_the_gap_only_when_both_workdays_are_absent() -> None:
    friday = date(2026, 11, 20)
    saturday = date(2026, 11, 21)
    sunday = date(2026, 11, 22)
    monday = date(2026, 11, 23)
    gap = [
        (friday, "WORK", "ABSENT"),
        (saturday, "WEEKLY_OFF", "PRESENT"),
        (sunday, "HOLIDAY", "PRESENT"),
        (monday, "WORK", "ABSENT"),
    ]
    assert sandwiched_dates(gap) == [saturday, sunday]
    worked = gap[:-1] + [(monday, "WORK", "PRESENT")]
    assert sandwiched_dates(worked) == []


def test_muster_joins_attendance_and_leave_without_wages() -> None:
    employee_id = uuid4()
    day = date(2026, 11, 24)
    lines = muster_lines(
        [(employee_id, "E-1")],
        [(employee_id, day, "HALF_DAY", 240, 0, None)],
        [(employee_id, day, "CL", Decimal("0.5"), "SECOND_HALF")],
    )
    assert lines == [
        {
            "employee_id": str(employee_id),
            "employee_code": "E-1",
            "calendar_date": "2026-11-24",
            "attendance_status": "HALF_DAY",
            "worked_minutes": 240,
            "overtime_minutes": 0,
            "anomaly_code": None,
            "leave_type_code": "CL",
            "leave_days": "0.5",
            "leave_portion": "SECOND_HALF",
        }
    ]
    assert "wage" not in lines[0]
    assert "salary" not in lines[0]

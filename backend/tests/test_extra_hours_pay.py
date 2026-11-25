"""Extra-hours pay is only what an admin entered."""

import importlib.util
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace

_PATH = Path(__file__).resolve().parents[1] / "app" / "modules" / "policies" / "extra_hours_pay.py"
_spec = importlib.util.spec_from_file_location("extra_hours_pay", _PATH)
assert _spec is not None and _spec.loader is not None
_module = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_module)
resolve_extra_hours_pay = _module.resolve_extra_hours_pay


def test_blank_rate_is_not_paid() -> None:
    pay = resolve_extra_hours_pay(SimpleNamespace(ot_multiplier=None, extra_hours_amount=None, extra_hours_amount_unit=None))
    assert pay.basis == "NONE"


def test_zero_amount_without_multiplier_is_not_paid() -> None:
    pay = resolve_extra_hours_pay(
        SimpleNamespace(ot_multiplier=None, extra_hours_amount=Decimal("0"), extra_hours_amount_unit=None)
    )
    assert pay.basis == "NONE"


def test_fixed_amount_is_used_when_present() -> None:
    pay = resolve_extra_hours_pay(
        SimpleNamespace(
            ot_multiplier=Decimal("1.50"),
            extra_hours_amount=Decimal("125.00"),
            extra_hours_amount_unit="HOUR",
        )
    )
    assert pay.basis == "FIXED_AMOUNT"
    assert pay.amount == Decimal("125.00")
    assert pay.unit == "HOUR"
    assert pay.multiplier is None


def test_threshold_mode_uses_the_admin_threshold() -> None:
    status, minutes = _module.decide_overtime_status(
        auto_enabled=True,
        mode="THRESHOLD_BASED",
        raw_minutes=30,
        threshold_minutes=60,
        work_mode=None,
        wfh_requires_approval=True,
        has_pay_rate=True,
    )
    assert status == "APPROVED_FOR_PAY"
    assert minutes == 30
    blocked, _ = _module.decide_overtime_status(
        auto_enabled=True,
        mode="THRESHOLD_BASED",
        raw_minutes=90,
        threshold_minutes=60,
        work_mode=None,
        wfh_requires_approval=True,
        has_pay_rate=True,
    )
    assert blocked == "UNREVIEWED"


def test_threshold_without_a_configured_limit_is_not_approved() -> None:
    status, minutes = _module.decide_overtime_status(
        auto_enabled=True,
        mode="THRESHOLD_BASED",
        raw_minutes=30,
        threshold_minutes=None,
        work_mode=None,
        wfh_requires_approval=False,
        has_pay_rate=True,
    )
    assert status == "UNREVIEWED"
    assert minutes == 0


def test_wfh_only_approves_work_from_home_days() -> None:
    home, home_minutes = _module.decide_overtime_status(
        auto_enabled=True,
        mode="WFH_ONLY",
        raw_minutes=45,
        threshold_minutes=None,
        work_mode="WFH",
        wfh_requires_approval=True,
        has_pay_rate=True,
    )
    office, _ = _module.decide_overtime_status(
        auto_enabled=True,
        mode="WFH_ONLY",
        raw_minutes=45,
        threshold_minutes=None,
        work_mode=None,
        wfh_requires_approval=False,
        has_pay_rate=True,
    )
    assert home == "APPROVED_FOR_PAY"
    assert home_minutes == 45
    assert office == "UNREVIEWED"


def test_auto_approval_stays_off_until_enabled() -> None:
    status, _ = _module.decide_overtime_status(
        auto_enabled=False,
        mode="AUTO_APPROVE_ALL",
        raw_minutes=60,
        threshold_minutes=None,
        work_mode=None,
        wfh_requires_approval=False,
        has_pay_rate=True,
    )
    assert status == "UNREVIEWED"


def test_multiplier_is_used_only_when_no_amount_is_set() -> None:
    pay = resolve_extra_hours_pay(
        SimpleNamespace(ot_multiplier=Decimal("2"), extra_hours_amount=None, extra_hours_amount_unit=None)
    )
    assert pay.basis == "MULTIPLIER"
    assert pay.multiplier == Decimal("2")
    assert pay.amount is None

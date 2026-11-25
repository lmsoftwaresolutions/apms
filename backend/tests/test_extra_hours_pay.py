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


def test_multiplier_is_used_only_when_no_amount_is_set() -> None:
    pay = resolve_extra_hours_pay(
        SimpleNamespace(ot_multiplier=Decimal("2"), extra_hours_amount=None, extra_hours_amount_unit=None)
    )
    assert pay.basis == "MULTIPLIER"
    assert pay.multiplier == Decimal("2")
    assert pay.amount is None

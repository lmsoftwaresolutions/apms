"""Admin-configured extra-hours rate. Nothing here invents a rate."""

from dataclasses import dataclass
from decimal import Decimal
from typing import Any


@dataclass(frozen=True)
class ExtraHoursPay:
    basis: str  # NONE, FIXED_AMOUNT, MULTIPLIER
    multiplier: Decimal | None
    amount: Decimal | None
    unit: str | None


def _decimal(value: Any) -> Decimal | None:
    if value is None:
        return None
    return Decimal(str(value))


def resolve_extra_hours_pay(policy: object | None) -> ExtraHoursPay:
    """A fixed amount above zero is the pay rate.

    When that amount is missing or zero, a multiplier above zero is the rate.
    Otherwise extra hours have no pay configured.
    """
    if policy is None:
        return ExtraHoursPay("NONE", None, None, None)

    amount = _decimal(getattr(policy, "extra_hours_amount", None))
    unit = getattr(policy, "extra_hours_amount_unit", None)
    multiplier = _decimal(getattr(policy, "ot_multiplier", None))

    if amount is not None and amount > 0 and unit:
        return ExtraHoursPay("FIXED_AMOUNT", None, amount, unit)
    if multiplier is not None and multiplier > 0:
        return ExtraHoursPay("MULTIPLIER", multiplier, None, None)
    return ExtraHoursPay("NONE", None, None, None)

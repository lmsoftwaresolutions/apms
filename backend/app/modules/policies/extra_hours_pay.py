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


def decide_overtime_status(
    *,
    auto_enabled: bool,
    mode: str | None,
    raw_minutes: int,
    threshold_minutes: int | None,
    work_mode: str | None,
    wfh_requires_approval: bool,
    has_pay_rate: bool,
) -> tuple[str, int]:
    """Return status and approved minutes. Nothing here is approved unless the admin turned auto-approval on and set the matching rule."""
    unreviewed = ("UNREVIEWED", 0)
    if not has_pay_rate or not auto_enabled or raw_minutes <= 0:
        return unreviewed

    if mode == "WFH_ONLY":
        if work_mode == "WFH":
            return ("APPROVED_FOR_PAY", raw_minutes)
        return unreviewed

    wfh_blocked = work_mode == "WFH" and wfh_requires_approval
    if mode == "AUTO_APPROVE_ALL":
        if wfh_blocked:
            return unreviewed
        return ("APPROVED_FOR_PAY", raw_minutes)

    if mode in {"AUTO_APPROVE_BELOW_THRESHOLD", "THRESHOLD_BASED"}:
        if wfh_blocked or threshold_minutes is None or raw_minutes > threshold_minutes:
            return unreviewed
        return ("APPROVED_FOR_PAY", raw_minutes)

    return unreviewed


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

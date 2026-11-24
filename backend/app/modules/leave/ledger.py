"""Append-only leave math. Balances are sums. They are never stored."""

from datetime import date
from decimal import Decimal

CREDIT_TYPES = frozenset({"ACCRUAL", "CREDIT"})
DEBIT_TYPES = frozenset({"DEBIT", "LAPSE"})
HALF_PORTIONS = frozenset({"FIRST_HALF", "SECOND_HALF"})


def signed_days(entry_type: str, days: Decimal) -> Decimal:
    if days <= 0:
        raise ValueError("Leave days must be positive.")
    if entry_type in CREDIT_TYPES:
        return days
    if entry_type in DEBIT_TYPES:
        return -days
    if entry_type == "LOP":
        return Decimal("0")
    raise ValueError(f"Unknown leave entry type {entry_type}.")


def balance(entries: list[tuple[str, Decimal]]) -> Decimal:
    total = Decimal("0")
    for entry_type, days in entries:
        total += signed_days(entry_type, days)
    return total


def split_shortfall(current: Decimal, requested: Decimal, allow_negative: bool) -> tuple[Decimal, Decimal]:
    """Return paid debit days and the loss-of-pay remainder."""
    if requested <= 0:
        raise ValueError("Requested days must be positive.")
    if allow_negative or current >= requested:
        return requested, Decimal("0")
    debit = current if current > 0 else Decimal("0")
    return debit, requested - debit


def request_span(start: date, end: date, portion: str) -> Decimal:
    if portion in HALF_PORTIONS:
        if start != end:
            raise ValueError("A half-day leave covers one date.")
        return Decimal("0.5")
    if portion != "FULL":
        raise ValueError("Leave portion must be FULL, FIRST_HALF, or SECOND_HALF.")
    if end < start:
        raise ValueError("Leave end is before the start.")
    return Decimal((end - start).days + 1)


def sandwiched_dates(days: list[tuple[date, str, str]]) -> list[date]:
    """Return weekly offs and holidays flanked by absent workdays.

    Each item is (calendar_date, kind, status). kind is WORK, WEEKLY_OFF, or HOLIDAY.
    Status matters only on WORK days. ABSENT on both sides converts the gap.
    """
    ordered = sorted(days, key=lambda item: item[0])
    found: list[date] = []
    index = 0
    count = len(ordered)
    while index < count:
        if ordered[index][1] == "WORK":
            index += 1
            continue
        start = index
        while index < count and ordered[index][1] != "WORK":
            index += 1
        if start == 0 or index >= count:
            continue
        before = ordered[start - 1]
        after = ordered[index]
        if before[2] == "ABSENT" and after[2] == "ABSENT":
            found.extend(ordered[cursor][0] for cursor in range(start, index))
    return found

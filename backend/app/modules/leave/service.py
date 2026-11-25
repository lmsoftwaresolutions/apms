from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.leave import Holiday, LeaveRequest, LeaveTransaction, LeaveType
from app.modules.employees.repository import get_employee_by_id
from app.modules.leave.ledger import balance, request_span, split_shortfall
from app.modules.leave.repository import (
    get_leave_type,
    get_request,
    insert_holiday,
    insert_leave_type,
    insert_request,
    insert_transaction,
    list_transactions,
)


async def create_leave_type(
    session: AsyncSession,
    tenant_id: UUID,
    code: str,
    name: str,
    allow_negative_balance: bool,
    sandwich_enabled: bool,
) -> LeaveType:
    row = LeaveType(
        id=uuid4(),
        tenant_id=tenant_id,
        code=code.strip().upper(),
        name=name.strip(),
        allow_negative_balance=allow_negative_balance,
        sandwich_enabled=sandwich_enabled,
    )
    return await insert_leave_type(session, row)


async def create_holiday(
    session: AsyncSession, tenant_id: UUID, branch_id: UUID, calendar_date, name: str
) -> Holiday:
    row = Holiday(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        calendar_date=calendar_date,
        name=name.strip(),
    )
    return await insert_holiday(session, row)


async def create_leave_request(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    leave_type_id: UUID,
    start_date,
    end_date,
    portion: str,
    reason: str,
) -> LeaveRequest:
    employee = await get_employee_by_id(session, tenant_id, employee_id)
    if employee is None:
        raise ProblemError(404, "Employee not found", "The employee is not in this tenant.")
    leave_type = await get_leave_type(session, tenant_id, leave_type_id)
    if leave_type is None:
        raise ProblemError(404, "Leave type not found", "The leave type is not in this tenant.")
    try:
        days = request_span(start_date, end_date, portion)
    except ValueError as exc:
        raise ProblemError(422, "Invalid leave span", str(exc)) from exc
    now = datetime.now(UTC)
    row = LeaveRequest(
        id=uuid4(),
        tenant_id=tenant_id,
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        start_date=start_date,
        end_date=end_date,
        portion=portion,
        days=days,
        reason=reason.strip(),
        status="PENDING",
        created_at=now,
        updated_at=now,
    )
    return await insert_request(session, row)


async def credit_leave(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    leave_type_id: UUID,
    days: Decimal,
    calendar_date,
    entry_type: str,
) -> LeaveTransaction:
    if entry_type not in {"ACCRUAL", "CREDIT"}:
        raise ProblemError(422, "Invalid credit", "A credit must be ACCRUAL or CREDIT.")
    if days <= 0:
        raise ProblemError(422, "Invalid days", "Credit days must be positive.")
    employee = await get_employee_by_id(session, tenant_id, employee_id)
    if employee is None:
        raise ProblemError(404, "Employee not found", "The employee is not in this tenant.")
    leave_type = await get_leave_type(session, tenant_id, leave_type_id)
    if leave_type is None:
        raise ProblemError(404, "Leave type not found", "The leave type is not in this tenant.")
    row = LeaveTransaction(
        id=uuid4(),
        tenant_id=tenant_id,
        employee_id=employee_id,
        leave_type_id=leave_type_id,
        calendar_date=calendar_date,
        entry_type=entry_type,
        days=days,
        created_at=datetime.now(UTC),
    )
    return await insert_transaction(session, row)


async def employee_balances(session: AsyncSession, tenant_id: UUID, employee_id: UUID) -> list[dict[str, str]]:
    rows = await list_transactions(session, tenant_id, employee_id)
    grouped: dict[UUID, list[tuple[str, Decimal]]] = {}
    for row in rows:
        grouped.setdefault(row.leave_type_id, []).append((row.entry_type, Decimal(row.days)))
    return [
        {"leave_type_id": str(leave_type_id), "balance_days": str(balance(entries))}
        for leave_type_id, entries in grouped.items()
    ]


LATE_PENALTY_MARKER = "LATE_PENALTY"


async def post_late_penalty(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    leave_type_id: UUID | None,
    calendar_date: date,
    action: str,
) -> str:
    """Post one half-day ledger row for a late penalty. A second run for the same day does nothing."""
    if action not in {"DEDUCT_LEAVE_HALF_DAY", "LOSS_OF_PAY"}:
        return "skipped"
    if leave_type_id is None:
        return "missing_leave_type"
    leave_type = await get_leave_type(session, tenant_id, leave_type_id)
    if leave_type is None:
        return "missing_leave_type"
    existing = [
        row
        for row in await list_transactions(session, tenant_id, employee_id)
        if row.calendar_date == calendar_date and row.session_target == LATE_PENALTY_MARKER
    ]
    if existing:
        return "already_posted"
    now = datetime.now(UTC)
    requested = Decimal("0.5")
    if action == "LOSS_OF_PAY":
        await insert_transaction(
            session,
            LeaveTransaction(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=employee_id,
                leave_type_id=leave_type_id,
                calendar_date=calendar_date,
                entry_type="LOP",
                days=requested,
                session_target=LATE_PENALTY_MARKER,
                created_at=now,
            ),
        )
        return "lop"
    current = balance(
        [
            (item.entry_type, Decimal(item.days))
            for item in await list_transactions(session, tenant_id, employee_id)
            if item.leave_type_id == leave_type_id
        ]
    )
    debit_days, lop_days = split_shortfall(current, requested, leave_type.allow_negative_balance)
    if debit_days > 0:
        await insert_transaction(
            session,
            LeaveTransaction(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=employee_id,
                leave_type_id=leave_type_id,
                calendar_date=calendar_date,
                entry_type="DEBIT",
                days=debit_days,
                session_target=LATE_PENALTY_MARKER,
                created_at=now,
            ),
        )
    if lop_days > 0:
        await insert_transaction(
            session,
            LeaveTransaction(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=employee_id,
                leave_type_id=leave_type_id,
                calendar_date=calendar_date,
                entry_type="LOP",
                days=lop_days,
                session_target=LATE_PENALTY_MARKER,
                created_at=now,
            ),
        )
    return "debited" if debit_days > 0 else "lop"


async def review_leave_request(
    session: AsyncSession,
    tenant_id: UUID,
    request_id: UUID,
    approver_user_id: UUID,
    approve: bool,
) -> LeaveRequest:
    row = await get_request(session, tenant_id, request_id)
    if row is None:
        raise ProblemError(404, "Leave request not found", "The request is not in this tenant.")
    if row.status != "PENDING":
        raise ProblemError(409, "Leave request is closed", "Only a pending request can be reviewed.")
    now = datetime.now(UTC)
    row.approver_user_id = approver_user_id
    row.updated_at = now
    if not approve:
        row.status = "REJECTED"
        await session.flush()
        return row
    leave_type = await get_leave_type(session, tenant_id, row.leave_type_id)
    if leave_type is None:
        raise ProblemError(404, "Leave type not found", "The leave type is not in this tenant.")
    current = balance(
        [
            (item.entry_type, Decimal(item.days))
            for item in await list_transactions(session, tenant_id, row.employee_id)
            if item.leave_type_id == row.leave_type_id
        ]
    )
    debit_days, lop_days = split_shortfall(current, Decimal(row.days), leave_type.allow_negative_balance)
    session_target = row.portion if row.portion in {"FIRST_HALF", "SECOND_HALF"} else None
    if debit_days > 0:
        await insert_transaction(
            session,
            LeaveTransaction(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=row.employee_id,
                leave_type_id=row.leave_type_id,
                request_id=row.id,
                calendar_date=row.start_date,
                entry_type="DEBIT",
                days=debit_days,
                session_target=session_target,
                created_at=now,
            ),
        )
    if lop_days > 0:
        await insert_transaction(
            session,
            LeaveTransaction(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=row.employee_id,
                leave_type_id=row.leave_type_id,
                request_id=row.id,
                calendar_date=row.start_date,
                entry_type="LOP",
                days=lop_days,
                session_target=session_target,
                created_at=now,
            ),
        )
    row.status = "APPROVED"
    await session.flush()
    return row

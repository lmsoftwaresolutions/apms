from datetime import UTC, datetime
from decimal import Decimal
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.leave import LeaveTransaction, LeaveType
from app.models.overtime import OvertimeRecord
from app.modules.overtime.repository import (
    get_overtime_record,
    get_quarterly_approved_ot_minutes,
    get_statutory_ot_cap,
    insert_or_update_overtime_record,
    list_overtime_records,
)


async def approve_overtime(
    session: AsyncSession,
    tenant_id: UUID,
    overtime_id: UUID,
    approved_minutes: int,
    supervisor_id: UUID,
    decision_reason: str | None = None,
) -> OvertimeRecord:
    rec = await get_overtime_record(session, tenant_id, overtime_id)
    if rec is None:
        raise ProblemError(404, "Overtime record not found", "The overtime record does not exist in this tenant.")
    if rec.status in {"CONVERTED_TO_COMPOFF", "REJECTED"}:
        raise ProblemError(409, "Overtime already decided", "This overtime record can no longer be approved.")

    if approved_minutes <= 0:
        raise ProblemError(422, "Invalid overtime minutes", "approved_minutes must be greater than zero.")

    quarter = (rec.overtime_date.month - 1) // 3 + 1
    used_minutes = await get_quarterly_approved_ot_minutes(
        session, tenant_id, rec.employee_id, rec.overtime_date.year, quarter, exclude_record_id=rec.id
    )
    cap = await get_statutory_ot_cap(session, state_code="DEFAULT", as_of=rec.overtime_date)
    quarterly_cap_hours = cap.quarterly_cap_hours if cap else 125
    quarterly_cap_minutes = quarterly_cap_hours * 60

    if (used_minutes + approved_minutes) > quarterly_cap_minutes:
        raise ProblemError(
            422,
            "Statutory cap exceeded",
            f"Approval exceeds statutory quarterly overtime cap of {quarterly_cap_hours} hours",
        )

    now = datetime.now(UTC)
    rec.status = "APPROVED_FOR_PAY"
    rec.approved_overtime_minutes = approved_minutes
    rec.supervisor_id = supervisor_id
    rec.decision_reason = decision_reason.strip() if decision_reason else None
    rec.reviewed_at = now
    rec.updated_at = now
    await session.flush()
    return rec


async def convert_to_compoff(
    session: AsyncSession,
    tenant_id: UUID,
    overtime_id: UUID,
    supervisor_id: UUID,
    decision_reason: str | None = None,
) -> OvertimeRecord:
    rec = await get_overtime_record(session, tenant_id, overtime_id)
    if rec is None:
        raise ProblemError(404, "Overtime record not found", "The overtime record does not exist in this tenant.")
    if rec.status == "CONVERTED_TO_COMPOFF":
        raise ProblemError(409, "Already converted", "This overtime record was already converted to comp-off.")
    if rec.status == "REJECTED":
        raise ProblemError(409, "Overtime rejected", "Rejected overtime cannot be converted to comp-off.")

    ot_mins = rec.approved_overtime_minutes if rec.approved_overtime_minutes > 0 else rec.raw_overtime_minutes
    if ot_mins <= 0:
        raise ProblemError(422, "No overtime minutes", "Cannot convert zero overtime minutes to comp-off.")

    # 1. Double-Entry Comp-off Days: Decimal(ot_mins) / Decimal(480) rounded to 1 decimal place (Invariant 3)
    calculated_days = round(Decimal(str(ot_mins)) / Decimal("480"), 1)
    if calculated_days <= 0:
        raise ProblemError(422, "Comp-off too small", "These overtime minutes round to zero comp-off days.")

    # 2. Find or create COMP_OFF leave type
    lt_stmt = select(LeaveType).where(LeaveType.tenant_id == tenant_id, LeaveType.code == "COMP_OFF")
    lt_res = await session.execute(lt_stmt)
    comp_off_type = lt_res.scalar_one_or_none()
    if comp_off_type is None:
        comp_off_type = LeaveType(
            id=uuid4(),
            tenant_id=tenant_id,
            code="COMP_OFF",
            name="Compensatory Off",
            allow_negative_balance=False,
            sandwich_enabled=False,
        )
        session.add(comp_off_type)
        await session.flush()

    # 3. Insert append-only transaction into leave_transactions
    now = datetime.now(UTC)
    tx = LeaveTransaction(
        id=uuid4(),
        tenant_id=tenant_id,
        employee_id=rec.employee_id,
        leave_type_id=comp_off_type.id,
        request_id=None,
        calendar_date=rec.overtime_date,
        entry_type="CREDIT",
        days=calculated_days,
        session_target=None,
        created_at=now,
    )
    session.add(tx)
    await session.flush()

    # 4. Update overtime record
    rec.status = "CONVERTED_TO_COMPOFF"
    rec.approved_overtime_minutes = ot_mins
    rec.comp_off_leave_transaction_id = tx.id
    rec.supervisor_id = supervisor_id
    rec.decision_reason = decision_reason.strip() if decision_reason else None
    rec.reviewed_at = now
    rec.updated_at = now
    await session.flush()
    return rec


async def reject_overtime(
    session: AsyncSession,
    tenant_id: UUID,
    overtime_id: UUID,
    supervisor_id: UUID,
    decision_reason: str,
) -> OvertimeRecord:
    if not decision_reason or not decision_reason.strip():
        raise ProblemError(422, "Decision reason required", "Rejecting overtime requires a decision reason.")

    rec = await get_overtime_record(session, tenant_id, overtime_id)
    if rec is None:
        raise ProblemError(404, "Overtime record not found", "The overtime record does not exist in this tenant.")
    if rec.status == "CONVERTED_TO_COMPOFF":
        raise ProblemError(409, "Already converted", "Comp-off overtime cannot be rejected.")

    now = datetime.now(UTC)
    rec.status = "REJECTED"
    rec.approved_overtime_minutes = 0
    rec.supervisor_id = supervisor_id
    rec.decision_reason = decision_reason.strip()
    rec.reviewed_at = now
    rec.updated_at = now
    await session.flush()
    return rec

from datetime import date
from uuid import UUID

from sqlalchemy import extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.overtime import OvertimeRecord, StatutoryOTCap


def get_quarter_bounds(year: int, quarter: int) -> tuple[date, date]:
    if quarter == 1:
        return date(year, 1, 1), date(year, 3, 31)
    elif quarter == 2:
        return date(year, 4, 1), date(year, 6, 30)
    elif quarter == 3:
        return date(year, 7, 1), date(year, 9, 30)
    else:
        return date(year, 10, 1), date(year, 12, 31)


async def get_statutory_ot_cap(
    session: AsyncSession,
    state_code: str = "DEFAULT",
    as_of: date | None = None,
) -> StatutoryOTCap | None:
    stmt = select(StatutoryOTCap).where(StatutoryOTCap.state_code == state_code)
    if as_of:
        stmt = stmt.where(StatutoryOTCap.effective_from <= as_of)
        stmt = stmt.where(
            (StatutoryOTCap.effective_to.is_(None)) | (StatutoryOTCap.effective_to >= as_of)
        )
    stmt = stmt.order_by(StatutoryOTCap.effective_from.desc()).limit(1)
    res = await session.execute(stmt)
    cap = res.scalar_one_or_none()
    if cap is None and state_code != "DEFAULT":
        return await get_statutory_ot_cap(session, state_code="DEFAULT", as_of=as_of)
    return cap


async def get_quarterly_approved_ot_minutes(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    year: int,
    quarter: int,
    exclude_record_id: UUID | None = None,
) -> int:
    start_date, end_date = get_quarter_bounds(year, quarter)
    stmt = (
        select(func.sum(OvertimeRecord.approved_overtime_minutes))
        .where(
            OvertimeRecord.tenant_id == tenant_id,
            OvertimeRecord.employee_id == employee_id,
            OvertimeRecord.overtime_date >= start_date,
            OvertimeRecord.overtime_date <= end_date,
            OvertimeRecord.status.in_(["APPROVED_FOR_PAY", "CONVERTED_TO_COMPOFF"]),
        )
    )
    if exclude_record_id:
        stmt = stmt.where(OvertimeRecord.id != exclude_record_id)
    res = await session.execute(stmt)
    return res.scalar_one() or 0


async def get_overtime_record(
    session: AsyncSession,
    tenant_id: UUID,
    record_id: UUID,
) -> OvertimeRecord | None:
    stmt = select(OvertimeRecord).where(
        OvertimeRecord.tenant_id == tenant_id,
        OvertimeRecord.id == record_id,
    )
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def get_overtime_record_by_attendance_id(
    session: AsyncSession,
    tenant_id: UUID,
    attendance_record_id: UUID,
) -> OvertimeRecord | None:
    stmt = select(OvertimeRecord).where(
        OvertimeRecord.tenant_id == tenant_id,
        OvertimeRecord.attendance_record_id == attendance_record_id,
    )
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def list_overtime_records(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    status: str | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[OvertimeRecord]:
    stmt = select(OvertimeRecord).where(OvertimeRecord.tenant_id == tenant_id)
    if employee_id:
        stmt = stmt.where(OvertimeRecord.employee_id == employee_id)
    if status:
        stmt = stmt.where(OvertimeRecord.status == status)
    if start_date:
        stmt = stmt.where(OvertimeRecord.overtime_date >= start_date)
    if end_date:
        stmt = stmt.where(OvertimeRecord.overtime_date <= end_date)
    stmt = stmt.order_by(OvertimeRecord.overtime_date.desc(), OvertimeRecord.created_at.desc())
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def insert_or_update_overtime_record(
    session: AsyncSession,
    record: OvertimeRecord,
) -> OvertimeRecord:
    session.add(record)
    await session.flush()
    return record

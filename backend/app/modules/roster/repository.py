from collections.abc import Sequence
from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.roster import DatedShiftInstance, RosterPattern


async def create_roster_pattern(
    session: AsyncSession,
    tenant_id: UUID,
    pattern: RosterPattern,
) -> RosterPattern:
    session.add(pattern)
    await session.flush()
    return pattern


async def get_roster_pattern_by_id(
    session: AsyncSession,
    tenant_id: UUID,
    pattern_id: UUID,
) -> RosterPattern | None:
    stmt = select(RosterPattern).where(
        RosterPattern.tenant_id == tenant_id,
        RosterPattern.id == pattern_id,
    )
    return await session.scalar(stmt)


async def get_roster_pattern_by_code(
    session: AsyncSession,
    tenant_id: UUID,
    code: str,
) -> RosterPattern | None:
    stmt = select(RosterPattern).where(
        RosterPattern.tenant_id == tenant_id,
        RosterPattern.code == code,
    )
    return await session.scalar(stmt)


async def list_roster_patterns(
    session: AsyncSession,
    tenant_id: UUID,
) -> Sequence[RosterPattern]:
    stmt = (
        select(RosterPattern)
        .where(RosterPattern.tenant_id == tenant_id)
        .order_by(RosterPattern.code)
    )
    result = await session.scalars(stmt)
    return result.all()


async def get_dated_shift_instance_by_id(
    session: AsyncSession,
    tenant_id: UUID,
    instance_id: UUID,
) -> DatedShiftInstance | None:
    stmt = select(DatedShiftInstance).where(
        DatedShiftInstance.tenant_id == tenant_id,
        DatedShiftInstance.id == instance_id,
    )
    return await session.scalar(stmt)


async def get_dated_shift_instance_by_employee_and_date(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> DatedShiftInstance | None:
    stmt = select(DatedShiftInstance).where(
        DatedShiftInstance.tenant_id == tenant_id,
        DatedShiftInstance.employee_id == employee_id,
        DatedShiftInstance.calendar_date == calendar_date,
    )
    return await session.scalar(stmt)


async def list_dated_shift_instances(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Sequence[DatedShiftInstance]:
    stmt = select(DatedShiftInstance).where(DatedShiftInstance.tenant_id == tenant_id)
    if employee_id is not None:
        stmt = stmt.where(DatedShiftInstance.employee_id == employee_id)
    if start_date is not None:
        stmt = stmt.where(DatedShiftInstance.calendar_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(DatedShiftInstance.calendar_date <= end_date)
    stmt = stmt.order_by(DatedShiftInstance.calendar_date, DatedShiftInstance.employee_id)
    result = await session.scalars(stmt)
    return result.all()


async def save_dated_shift_instance(
    session: AsyncSession,
    tenant_id: UUID,
    instance: DatedShiftInstance,
) -> DatedShiftInstance:
    merged = await session.merge(instance)
    await session.flush()
    return merged

from collections.abc import Sequence
from datetime import UTC, date, datetime, time, timedelta
from uuid import UUID

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.punch import PunchEvent, RawEnvelope
from app.modules.employees import repository as employee_repo


async def find_envelope_by_hash(
    session: AsyncSession, tenant_id: UUID, payload_hash: str
) -> RawEnvelope | None:
    stmt = select(RawEnvelope).where(
        RawEnvelope.tenant_id == tenant_id,
        RawEnvelope.payload_hash == payload_hash,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def insert_raw_envelope(
    session: AsyncSession, envelope: RawEnvelope
) -> RawEnvelope:
    session.add(envelope)
    await session.flush()
    return envelope


async def get_employee_id_by_code(
    session: AsyncSession, tenant_id: UUID, employee_code: str
) -> UUID | None:
    return await employee_repo.get_active_employee_id_by_code(session, tenant_id, employee_code)


async def find_recent_punch_within_window(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    punch_time: datetime,
    window_seconds: int = 60,
) -> PunchEvent | None:
    start_window = punch_time - timedelta(seconds=window_seconds)
    stmt = select(PunchEvent).where(
        PunchEvent.tenant_id == tenant_id,
        PunchEvent.employee_id == employee_id,
        PunchEvent.status == "ACTIVE",
        PunchEvent.punch_time >= start_window,
        PunchEvent.punch_time <= punch_time,
    ).limit(1)
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def insert_punch_events(
    session: AsyncSession, events: list[PunchEvent]
) -> list[PunchEvent]:
    for event in events:
        session.add(event)
    await session.flush()
    return events


async def list_punches_for_employee(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    start_time: datetime,
    end_time: datetime,
) -> Sequence[PunchEvent]:
    stmt = (
        select(PunchEvent)
        .where(
            PunchEvent.tenant_id == tenant_id,
            PunchEvent.employee_id == employee_id,
            PunchEvent.status == "ACTIVE",
            PunchEvent.punch_time >= start_time,
            PunchEvent.punch_time <= end_time,
        )
        .order_by(PunchEvent.punch_time.asc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()


async def newest_active_punch_created_at(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> datetime | None:
    start = datetime.combine(calendar_date, time(0, 0), tzinfo=UTC) - timedelta(hours=6)
    end = datetime.combine(calendar_date, time(23, 59, 59), tzinfo=UTC) + timedelta(hours=14)
    stmt = select(func.max(PunchEvent.created_at)).where(
        PunchEvent.tenant_id == tenant_id,
        PunchEvent.employee_id == employee_id,
        PunchEvent.status == "ACTIVE",
        PunchEvent.punch_time >= start,
        PunchEvent.punch_time <= end,
    )
    return await session.scalar(stmt)


async def list_punch_events(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    start_time: datetime | None = None,
    end_time: datetime | None = None,
    status: str | None = None,
    limit: int = 100,
    offset: int = 0,
) -> Sequence[PunchEvent]:
    stmt = select(PunchEvent).where(PunchEvent.tenant_id == tenant_id)
    if employee_id is not None:
        stmt = stmt.where(PunchEvent.employee_id == employee_id)
    if start_time is not None:
        stmt = stmt.where(PunchEvent.punch_time >= start_time)
    if end_time is not None:
        stmt = stmt.where(PunchEvent.punch_time <= end_time)
    if status is not None:
        stmt = stmt.where(PunchEvent.status == status)
    stmt = stmt.order_by(PunchEvent.punch_time.desc()).limit(limit).offset(offset)
    result = await session.execute(stmt)
    return result.scalars().all()

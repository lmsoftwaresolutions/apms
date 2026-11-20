from collections.abc import Sequence
from datetime import datetime, timedelta
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.punch import PunchEvent, RawEnvelope


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
    stmt = select(Employee.id).where(
        Employee.tenant_id == tenant_id,
        Employee.employee_code == employee_code,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def find_recent_punch_within_window(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    punch_time: datetime,
    window_seconds: int = 60,
) -> PunchEvent | None:
    start_window = punch_time - timedelta(seconds=window_seconds)
    end_window = punch_time + timedelta(seconds=window_seconds)
    stmt = select(PunchEvent).where(
        PunchEvent.tenant_id == tenant_id,
        PunchEvent.employee_id == employee_id,
        PunchEvent.status == "ACTIVE",
        PunchEvent.punch_time >= start_window,
        PunchEvent.punch_time <= end_window,
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
            PunchEvent.punch_time >= start_time,
            PunchEvent.punch_time <= end_time,
        )
        .order_by(PunchEvent.punch_time.asc())
    )
    result = await session.execute(stmt)
    return result.scalars().all()

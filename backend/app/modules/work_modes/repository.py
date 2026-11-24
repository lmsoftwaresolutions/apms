from datetime import date
from uuid import UUID

from sqlalchemy import distinct, extract, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.work_mode import WorkModeRequest


async def insert_work_mode_request(session: AsyncSession, row: WorkModeRequest) -> WorkModeRequest:
    session.add(row)
    await session.flush()
    return row


async def get_work_mode_request(
    session: AsyncSession,
    tenant_id: UUID,
    request_id: UUID,
) -> WorkModeRequest | None:
    stmt = select(WorkModeRequest).where(
        WorkModeRequest.tenant_id == tenant_id,
        WorkModeRequest.id == request_id,
    )
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def get_work_mode_by_date_session(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
    session_target: str,
) -> WorkModeRequest | None:
    stmt = select(WorkModeRequest).where(
        WorkModeRequest.tenant_id == tenant_id,
        WorkModeRequest.employee_id == employee_id,
        WorkModeRequest.calendar_date == calendar_date,
        WorkModeRequest.session_target == session_target,
        WorkModeRequest.status != "REJECTED",
    )
    res = await session.execute(stmt)
    return res.scalar_one_or_none()


async def list_work_mode_requests(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    status: str | None = None,
    calendar_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WorkModeRequest]:
    stmt = select(WorkModeRequest).where(WorkModeRequest.tenant_id == tenant_id)
    if employee_id is not None:
        stmt = stmt.where(WorkModeRequest.employee_id == employee_id)
    if status is not None:
        stmt = stmt.where(WorkModeRequest.status == status)
    if calendar_date is not None:
        stmt = stmt.where(WorkModeRequest.calendar_date == calendar_date)
    if start_date is not None:
        stmt = stmt.where(WorkModeRequest.calendar_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(WorkModeRequest.calendar_date <= end_date)
    stmt = stmt.order_by(WorkModeRequest.calendar_date.desc(), WorkModeRequest.created_at.desc())
    res = await session.execute(stmt)
    return list(res.scalars().all())


async def count_approved_wfh_days_in_month(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    year: int,
    month: int,
) -> int:
    stmt = (
        select(func.count(distinct(WorkModeRequest.calendar_date)))
        .where(
            WorkModeRequest.tenant_id == tenant_id,
            WorkModeRequest.employee_id == employee_id,
            WorkModeRequest.work_mode == "WFH",
            WorkModeRequest.status == "APPROVED",
            extract("year", WorkModeRequest.calendar_date) == year,
            extract("month", WorkModeRequest.calendar_date) == month,
        )
    )
    res = await session.execute(stmt)
    return res.scalar_one() or 0


async def find_approved_work_mode(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> WorkModeRequest | None:
    stmt = (
        select(WorkModeRequest)
        .where(
            WorkModeRequest.tenant_id == tenant_id,
            WorkModeRequest.employee_id == employee_id,
            WorkModeRequest.calendar_date == calendar_date,
            WorkModeRequest.status == "APPROVED",
            WorkModeRequest.session_target == "FULL",
        )
        .order_by(WorkModeRequest.created_at.desc())
        .limit(1)
    )
    res = await session.execute(stmt)
    return res.scalar_one_or_none()

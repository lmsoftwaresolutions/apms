from datetime import date
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.leave import Holiday, LeaveRequest, LeaveTransaction, LeaveType


async def insert_leave_type(session: AsyncSession, row: LeaveType) -> LeaveType:
    session.add(row)
    await session.flush()
    return row


async def list_leave_types(session: AsyncSession, tenant_id: UUID) -> list[LeaveType]:
    stmt = select(LeaveType).where(LeaveType.tenant_id == tenant_id).order_by(LeaveType.code)
    return list((await session.scalars(stmt)).all())


async def get_leave_type(session: AsyncSession, tenant_id: UUID, leave_type_id: UUID) -> LeaveType | None:
    stmt = select(LeaveType).where(LeaveType.tenant_id == tenant_id, LeaveType.id == leave_type_id)
    return await session.scalar(stmt)


async def insert_holiday(session: AsyncSession, row: Holiday) -> Holiday:
    session.add(row)
    await session.flush()
    return row


async def list_holidays(
    session: AsyncSession,
    tenant_id: UUID,
    branch_id: UUID,
    start_date: date,
    end_date: date,
) -> list[Holiday]:
    stmt = (
        select(Holiday)
        .where(
            Holiday.tenant_id == tenant_id,
            Holiday.branch_id == branch_id,
            Holiday.calendar_date >= start_date,
            Holiday.calendar_date <= end_date,
        )
        .order_by(Holiday.calendar_date)
    )
    return list((await session.scalars(stmt)).all())


async def insert_request(session: AsyncSession, row: LeaveRequest) -> LeaveRequest:
    session.add(row)
    await session.flush()
    return row


async def get_request(session: AsyncSession, tenant_id: UUID, request_id: UUID) -> LeaveRequest | None:
    stmt = select(LeaveRequest).where(LeaveRequest.tenant_id == tenant_id, LeaveRequest.id == request_id)
    return await session.scalar(stmt)


async def list_requests(
    session: AsyncSession, tenant_id: UUID, employee_id: UUID | None
) -> list[LeaveRequest]:
    stmt = select(LeaveRequest).where(LeaveRequest.tenant_id == tenant_id)
    if employee_id is not None:
        stmt = stmt.where(LeaveRequest.employee_id == employee_id)
    stmt = stmt.order_by(LeaveRequest.start_date.desc())
    return list((await session.scalars(stmt)).all())


async def insert_transaction(session: AsyncSession, row: LeaveTransaction) -> LeaveTransaction:
    session.add(row)
    await session.flush()
    return row


async def list_transactions(
    session: AsyncSession, tenant_id: UUID, employee_id: UUID
) -> list[LeaveTransaction]:
    stmt = (
        select(LeaveTransaction)
        .where(LeaveTransaction.tenant_id == tenant_id, LeaveTransaction.employee_id == employee_id)
        .order_by(LeaveTransaction.created_at)
    )
    return list((await session.scalars(stmt)).all())


async def approved_leave_marks(
    session: AsyncSession, tenant_id: UUID, start_date: date, end_date: date
) -> list[tuple[LeaveRequest, LeaveType]]:
    stmt = (
        select(LeaveRequest, LeaveType)
        .join(
            LeaveType,
            (LeaveType.tenant_id == LeaveRequest.tenant_id) & (LeaveType.id == LeaveRequest.leave_type_id),
        )
        .where(
            LeaveRequest.tenant_id == tenant_id,
            LeaveRequest.status == "APPROVED",
            LeaveRequest.start_date <= end_date,
            LeaveRequest.end_date >= start_date,
        )
    )
    return list((await session.execute(stmt)).all())

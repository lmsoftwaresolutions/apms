from collections.abc import Sequence
from datetime import date
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.attendance import AttendanceDailyRecord, AttendanceExplanationTrace
from app.models.rollup_failure import AttendanceRollupFailure


async def find_attendance_record(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> AttendanceDailyRecord | None:
    stmt = select(AttendanceDailyRecord).where(
        AttendanceDailyRecord.tenant_id == tenant_id,
        AttendanceDailyRecord.employee_id == employee_id,
        AttendanceDailyRecord.calendar_date == calendar_date,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_attendance_record_by_id(
    session: AsyncSession,
    tenant_id: UUID,
    record_id: UUID,
) -> AttendanceDailyRecord | None:
    stmt = select(AttendanceDailyRecord).where(
        AttendanceDailyRecord.tenant_id == tenant_id,
        AttendanceDailyRecord.id == record_id,
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def get_trace_by_record_id(
    session: AsyncSession,
    tenant_id: UUID,
    record_id: UUID,
) -> AttendanceExplanationTrace | None:
    stmt = (
        select(AttendanceExplanationTrace)
        .where(
            AttendanceExplanationTrace.tenant_id == tenant_id,
            AttendanceExplanationTrace.attendance_record_id == record_id,
        )
        .order_by(AttendanceExplanationTrace.evaluated_at.desc())
        .limit(1)
    )
    result = await session.execute(stmt)
    return result.scalar_one_or_none()


async def save_attendance_record(
    session: AsyncSession,
    record: AttendanceDailyRecord,
) -> AttendanceDailyRecord:
    session.add(record)
    await session.flush()
    return record


async def save_explanation_trace(
    session: AsyncSession,
    trace: AttendanceExplanationTrace,
) -> AttendanceExplanationTrace:
    # Strictly append-only audit trace (Invariant 4, ATT-09)
    session.add(trace)
    await session.flush()
    return trace


async def list_attendance_records(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> Sequence[AttendanceDailyRecord]:
    stmt = select(AttendanceDailyRecord).where(AttendanceDailyRecord.tenant_id == tenant_id)
    if employee_id is not None:
        stmt = stmt.where(AttendanceDailyRecord.employee_id == employee_id)
    if start_date is not None:
        stmt = stmt.where(AttendanceDailyRecord.calendar_date >= start_date)
    if end_date is not None:
        stmt = stmt.where(AttendanceDailyRecord.calendar_date <= end_date)
    stmt = stmt.order_by(AttendanceDailyRecord.calendar_date.desc())
    result = await session.execute(stmt)
    return result.scalars().all()


async def list_rollup_failures(
    session: AsyncSession,
    tenant_id: UUID,
    limit: int = 100,
) -> Sequence[AttendanceRollupFailure]:
    stmt = (
        select(AttendanceRollupFailure)
        .where(AttendanceRollupFailure.tenant_id == tenant_id)
        .order_by(AttendanceRollupFailure.created_at.desc())
        .limit(limit)
    )
    result = await session.execute(stmt)
    return result.scalars().all()

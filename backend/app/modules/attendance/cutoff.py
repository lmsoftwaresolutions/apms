from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.rollup_failure import AttendanceRollupFailure
from app.modules.attendance.repository import find_attendance_record, find_rollup_failure
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.employees.repository import list_active_employee_ids
from app.modules.punches.repository import newest_active_punch_created_at
from app.modules.roster.repository import list_dated_shift_instances

IST = ZoneInfo("Asia/Kolkata")
LOOKBACK_DAYS = 7


def cutoff_utc(calendar_date: date, sessions: list[dict]) -> datetime | None:
    """Return the last session end plus its post window, in UTC."""
    if not sessions:
        return None
    last = max(sessions, key=lambda item: int(item.get("session_order", 1)))
    end_value = last.get("end_time")
    start_value = last.get("start_time")
    if not isinstance(end_value, str) or not isinstance(start_value, str):
        return None
    end = time.fromisoformat(end_value)
    start = time.fromisoformat(start_value)
    end_date = calendar_date
    if last.get("is_overnight") or end < start:
        end_date = calendar_date + timedelta(days=1)
    local_end = datetime.combine(end_date, end, tzinfo=IST)
    post = int(last.get("post_window_minutes", 120))
    return (local_end + timedelta(minutes=post)).astimezone(UTC)


def ist_today(now: datetime) -> date:
    return now.astimezone(IST).date()


def evaluation_is_current(record_updated_at: datetime | None, newest_punch_at: datetime | None) -> bool:
    """A stored day is current until a newer active punch arrives."""
    if record_updated_at is None:
        return False
    if newest_punch_at is None:
        return True
    return newest_punch_at <= record_updated_at


def is_due(calendar_date: date, sessions: list[dict], now: datetime, is_rest_day: bool) -> bool:
    if is_rest_day:
        return False
    cutoff = cutoff_utc(calendar_date, sessions)
    if cutoff is None:
        return False
    return now.astimezone(UTC) >= cutoff


async def record_rollup_failure(
    session: AsyncSession,
    tenant_id,
    employee_id,
    calendar_date: date,
    exc: Exception,
) -> None:
    title = exc.title if isinstance(exc, ProblemError) else type(exc).__name__
    detail = exc.detail if isinstance(exc, ProblemError) else str(exc)
    existing = await find_rollup_failure(session, tenant_id, employee_id, calendar_date, title[:200])
    if existing is not None:
        return
    session.add(
        AttendanceRollupFailure(
            id=uuid4(),
            tenant_id=tenant_id,
            employee_id=employee_id,
            calendar_date=calendar_date,
            error_title=title[:200],
            error_detail=detail[:2000],
            created_at=datetime.now(UTC),
        )
    )
    await session.flush()


async def run_cutoff_rollup(session: AsyncSession, tenant_id, now: datetime) -> int:
    """Evaluate dated shifts whose post-window has closed. Returns the number evaluated."""
    start = now.astimezone(IST).date() - timedelta(days=LOOKBACK_DAYS)
    end = now.astimezone(IST).date()
    instances = await list_dated_shift_instances(session, tenant_id, start_date=start, end_date=end)
    if not instances:
        return 0
    active_employee_ids = await list_active_employee_ids(
        session, tenant_id, list({inst.employee_id for inst in instances})
    )
    evaluated = 0
    for instance in instances:
        if instance.employee_id not in active_employee_ids:
            continue
        if not is_due(instance.calendar_date, list(instance.sessions or []), now, instance.is_rest_day):
            continue
        existing = await find_attendance_record(
            session, tenant_id, instance.employee_id, instance.calendar_date
        )
        newest_punch = await newest_active_punch_created_at(
            session, tenant_id, instance.employee_id, instance.calendar_date
        )
        if evaluation_is_current(None if existing is None else existing.updated_at, newest_punch):
            continue
        try:
            async with session.begin_nested():
                await calculate_and_save_daily_attendance(
                    session=session,
                    tenant_id=tenant_id,
                    employee_id=instance.employee_id,
                    calendar_date=instance.calendar_date,
                )
            evaluated += 1
        except Exception as exc:
            await record_rollup_failure(session, tenant_id, instance.employee_id, instance.calendar_date, exc)
    return evaluated

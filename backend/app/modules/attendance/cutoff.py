from datetime import UTC, date, datetime, time, timedelta
from uuid import uuid4
from zoneinfo import ZoneInfo

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.rollup_failure import AttendanceRollupFailure
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.roster.repository import list_dated_shift_instances

IST = ZoneInfo("Asia/Kolkata")


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
    start = (now.astimezone(IST).date() - timedelta(days=2))
    end = now.astimezone(IST).date()
    instances = await list_dated_shift_instances(session, tenant_id, start_date=start, end_date=end)
    evaluated = 0
    for instance in instances:
        if not is_due(instance.calendar_date, list(instance.sessions or []), now, instance.is_rest_day):
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

from datetime import date, timedelta
from decimal import Decimal
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.modules.attendance.repository import list_attendance_records
from app.modules.employees.repository import list_employees_by_tenant
from app.modules.leave.repository import approved_leave_marks
from app.modules.muster.rows import muster_lines


def _leave_days(start: date, end: date, portion: str, window_start: date, window_end: date):
    if portion in {"FIRST_HALF", "SECOND_HALF"}:
        if window_start <= start <= window_end:
            yield start, Decimal("0.5"), portion
        return
    cursor = max(start, window_start)
    last = min(end, window_end)
    while cursor <= last:
        yield cursor, Decimal("1"), "FULL"
        cursor += timedelta(days=1)


async def export_muster(
    session: AsyncSession,
    tenant_id: UUID,
    start_date: date,
    end_date: date,
    branch_id: UUID | None,
) -> list[dict[str, object]]:
    if end_date < start_date:
        raise ProblemError(422, "Invalid muster range", "The end date is before the start date.")
    if (end_date - start_date).days > 62:
        raise ProblemError(422, "Muster range too long", "Export at most 63 days at a time.")
    employees = await list_employees_by_tenant(session, tenant_id, branch_id=branch_id, is_active=True)
    employee_ids = {row.id for row in employees}
    records = await list_attendance_records(session, tenant_id, start_date=start_date, end_date=end_date)
    marks = await approved_leave_marks(session, tenant_id, start_date, end_date)
    attendance = [
        (
            row.employee_id,
            row.calendar_date,
            row.status,
            row.worked_duration_minutes,
            row.overtime_minutes,
            row.anomaly_code,
        )
        for row in records
        if row.employee_id in employee_ids
    ]
    leave_rows = []
    for request, leave_type in marks:
        if request.employee_id not in employee_ids:
            continue
        for day, days, portion in _leave_days(
            request.start_date, request.end_date, request.portion, start_date, end_date
        ):
            leave_rows.append((request.employee_id, day, leave_type.code, days, portion))
    return muster_lines([(row.id, row.employee_code) for row in employees], attendance, leave_rows)

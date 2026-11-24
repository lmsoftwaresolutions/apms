import calendar
from datetime import UTC, date, datetime, timedelta
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.branch import Branch
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.leave import Holiday
from app.models.roster import DatedShiftInstance
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


async def fetch_muster(
    session: AsyncSession,
    tenant_id: UUID,
    year: int,
    month: int,
    department_id: UUID | None = None,
) -> dict[str, Any]:
    """Fetch structured muster roll data for statutory export without wages.

    Enforces multi-tenant RLS, aggregates daily attendance and leave marks,
    and returns daily status matrices and summaries.
    """
    if month < 1 or month > 12:
        raise ProblemError(422, "Invalid month", "Month must be between 1 and 12.")
    if year < 1900 or year > 2100:
        raise ProblemError(422, "Invalid year", "Year must be between 1900 and 2100.")

    num_days = calendar.monthrange(year, month)[1]
    start_date = date(year, month, 1)
    end_date = date(year, month, num_days)

    # 1. Tenant & Organization metadata
    tenant = await session.scalar(select(Tenant).where(Tenant.id == tenant_id))
    tenant_name = tenant.display_name or tenant.name if tenant else "APMS Enterprise"

    branches = (await session.scalars(select(Branch).where(Branch.tenant_id == tenant_id))).all()
    branch_map = {b.id: b.name for b in branches}

    departments = (await session.scalars(select(Department).where(Department.tenant_id == tenant_id))).all()
    dept_map = {d.id: d.name for d in departments}

    designations = (await session.scalars(select(Designation).where(Designation.tenant_id == tenant_id))).all()
    desig_map = {d.id: d.name for d in designations}

    # 2. Employees in scope
    stmt = select(Employee).where(Employee.tenant_id == tenant_id, Employee.is_active.is_(True))
    if department_id is not None:
        stmt = stmt.where(Employee.department_id == department_id)
    stmt = stmt.order_by(Employee.employee_code)
    employees = (await session.scalars(stmt)).all()
    employee_ids = {e.id for e in employees}

    # 3. Attendance records in date window
    records = await list_attendance_records(session, tenant_id, start_date=start_date, end_date=end_date)
    att_by_emp_date = {(r.employee_id, r.calendar_date): r for r in records if r.employee_id in employee_ids}

    # 4. Approved leave marks
    marks = await approved_leave_marks(session, tenant_id, start_date, end_date)
    leave_by_emp_date: dict[tuple[UUID, date], tuple[str, Decimal, str]] = {}
    for request, leave_type in marks:
        if request.employee_id not in employee_ids:
            continue
        for day, days, portion in _leave_days(
            request.start_date, request.end_date, request.portion, start_date, end_date
        ):
            leave_by_emp_date[(request.employee_id, day)] = (leave_type.code, days, portion)

    # 5. Branch holidays
    h_stmt = select(Holiday).where(
        Holiday.tenant_id == tenant_id,
        Holiday.calendar_date >= start_date,
        Holiday.calendar_date <= end_date,
    )
    holidays = (await session.scalars(h_stmt)).all()
    holidays_by_branch_date = {(h.branch_id, h.calendar_date): h.name for h in holidays}

    # 6. Dated Shift Instances (Roster/Rest Days)
    s_stmt = select(DatedShiftInstance).where(
        DatedShiftInstance.tenant_id == tenant_id,
        DatedShiftInstance.calendar_date >= start_date,
        DatedShiftInstance.calendar_date <= end_date,
    )
    shifts = (await session.scalars(s_stmt)).all()
    shifts_by_emp_date = {(s.employee_id, s.calendar_date): s for s in shifts if s.employee_id in employee_ids}

    # 7. Build matrix for each employee
    employee_rows = []
    for emp in employees:
        emp_id = emp.id
        daily_status: dict[int, str] = {}
        total_present = 0.0
        total_absent = 0.0
        total_leave = 0.0
        total_worked_mins = 0
        total_ot_mins = 0

        for day_num in range(1, num_days + 1):
            cal_date = date(year, month, day_num)
            att = att_by_emp_date.get((emp_id, cal_date))
            l_mark = leave_by_emp_date.get((emp_id, cal_date))
            is_holiday = (emp.branch_id, cal_date) in holidays_by_branch_date
            shift = shifts_by_emp_date.get((emp_id, cal_date))

            worked_mins = att.worked_duration_minutes if att else 0
            ot_mins = att.overtime_minutes if att else 0
            total_worked_mins += worked_mins
            total_ot_mins += ot_mins

            if l_mark:
                code, days, portion = l_mark
                if portion == "FULL":
                    daily_status[day_num] = code
                    total_leave += float(days)
                else:
                    daily_status[day_num] = "HD"
                    total_leave += 0.5
                    if att and (att.status in ("PRESENT", "HALF_DAY") or worked_mins > 0):
                        total_present += 0.5
                    else:
                        total_absent += 0.5
            elif att is not None:
                if att.status == "PRESENT":
                    daily_status[day_num] = "P"
                    total_present += 1.0
                elif att.status == "HALF_DAY":
                    daily_status[day_num] = "HD"
                    total_present += 0.5
                    total_absent += 0.5
                elif att.status in ("REST_DAY", "WEEKLY_OFF"):
                    daily_status[day_num] = "WO"
                elif att.status in ("HOLIDAY", "H"):
                    daily_status[day_num] = "H"
                elif att.status == "ABSENT":
                    daily_status[day_num] = "A"
                    total_absent += 1.0
                else:
                    if worked_mins >= 240:
                        daily_status[day_num] = "P"
                        total_present += 1.0
                    elif worked_mins > 0:
                        daily_status[day_num] = "HD"
                        total_present += 0.5
                        total_absent += 0.5
                    else:
                        daily_status[day_num] = "A"
                        total_absent += 1.0
            elif is_holiday:
                daily_status[day_num] = "H"
            elif shift and (shift.is_rest_day or shift.status == "REST_DAY"):
                daily_status[day_num] = "WO"
            elif cal_date.weekday() == 6:  # Sunday default rest day
                daily_status[day_num] = "WO"
            else:
                daily_status[day_num] = "A"
                total_absent += 1.0

        summary = {
            "total_days": num_days,
            "total_present": round(total_present, 1),
            "total_absent": round(total_absent, 1),
            "total_leave": round(total_leave, 1),
            "worked_hours": round(total_worked_mins / 60.0, 2),
            "ot_hours": round(total_ot_mins / 60.0, 2),
        }

        employee_rows.append(
            {
                "employee_id": str(emp_id),
                "employee_code": emp.employee_code,
                "employee_name": emp.full_name,
                "department": dept_map.get(emp.department_id, "General") if emp.department_id else "General",
                "designation": emp.designation or (desig_map.get(emp.designation_id, "Staff") if emp.designation_id else "Staff"),
                "branch": branch_map.get(emp.branch_id, "Main Branch"),
                "daily_status": daily_status,
                "summary": summary,
            }
        )

    first_branch = "Main Branch"
    if employees and employees[0].branch_id in branch_map:
        first_branch = branch_map[employees[0].branch_id]
    elif branch_map:
        first_branch = next(iter(branch_map.values()))

    meta = {
        "tenant_id": str(tenant_id),
        "tenant_name": tenant_name,
        "branch_name": first_branch,
        "year": year,
        "month": month,
        "month_name": date(year, month, 1).strftime("%B"),
        "total_days": num_days,
        "generated_at": datetime.now(UTC).strftime("%Y-%m-%d %H:%M:%S UTC"),
        "department_id": str(department_id) if department_id else None,
        "registration_number": "REG-FAC-1948",
        "factory_name": tenant_name,
        "establishment_name": tenant_name,
        "contractor_name": "N/A - Direct Employment",
    }

    return {
        "meta": meta,
        "days": list(range(1, num_days + 1)),
        "employees": employee_rows,
    }


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

from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.punch import PunchEvent, RawEnvelope
from app.models.regularization import AttendanceRegularization
from app.modules.attendance.service import calculate_and_save_daily_attendance, punch_search_window
from app.modules.employees import repository as emp_repo
from app.modules.punches.repository import insert_punch_events, insert_raw_envelope
from app.modules.punches.service import compute_payload_hash

REQUEST_TYPES = {"MISSED_IN", "MISSED_OUT", "BOTH", "ON_DUTY"}


def assert_inside_day(calendar_date, punch_time: datetime | None) -> None:
    if punch_time is None:
        return
    if punch_time.tzinfo is None:
        raise ProblemError(422, "Timezone required", "A requested punch time needs a timezone.")
    start, end = punch_search_window(calendar_date)
    if punch_time < start or punch_time > end:
        raise ProblemError(
            422,
            "Punch outside the day",
            "The requested time is outside the attendance search window for that calendar date.",
        )


def required_punches(request_type: str, requested_in: datetime | None, requested_out: datetime | None) -> None:
    if request_type not in REQUEST_TYPES:
        raise ProblemError(422, "Unknown request type", "Use MISSED_IN, MISSED_OUT, BOTH, or ON_DUTY.")
    if request_type in {"MISSED_IN", "BOTH", "ON_DUTY"} and requested_in is None:
        raise ProblemError(422, "Missing in punch", "This request needs a requested in time.")
    if request_type in {"MISSED_OUT", "BOTH", "ON_DUTY"} and requested_out is None:
        raise ProblemError(422, "Missing out punch", "This request needs a requested out time.")


async def create_request(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date,
    request_type: str,
    requested_in: datetime | None,
    requested_out: datetime | None,
    reason: str,
) -> AttendanceRegularization:
    required_punches(request_type, requested_in, requested_out)
    assert_inside_day(calendar_date, requested_in)
    assert_inside_day(calendar_date, requested_out)
    emp = await emp_repo.get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
    if not emp.is_active:
        raise ProblemError(400, "Inactive employee", "Cannot submit attendance regularization for a deactivated employee.")
    now = datetime.now(UTC)
    row = AttendanceRegularization(
        id=uuid4(),
        tenant_id=tenant_id,
        employee_id=employee_id,
        calendar_date=calendar_date,
        request_type=request_type,
        requested_in=requested_in,
        requested_out=requested_out,
        reason=reason.strip(),
        status="PENDING",
        created_at=now,
        updated_at=now,
    )
    session.add(row)
    await session.flush()
    return row


async def list_requests(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
) -> list[AttendanceRegularization]:
    stmt = select(AttendanceRegularization).where(AttendanceRegularization.tenant_id == tenant_id)
    if employee_id is not None:
        stmt = stmt.where(AttendanceRegularization.employee_id == employee_id)
    stmt = stmt.order_by(AttendanceRegularization.created_at.desc())
    return list((await session.scalars(stmt)).all())


async def review_request(
    session: AsyncSession,
    tenant_id: UUID,
    request_id: UUID,
    approver_user_id: UUID,
    approve: bool,
    comment: str | None,
) -> AttendanceRegularization:
    row = await session.get(AttendanceRegularization, request_id)
    if row is None or row.tenant_id != tenant_id:
        raise ProblemError(404, "Request not found", "No regularization with that id exists in this tenant.")
    if row.status != "PENDING":
        raise ProblemError(409, "Request already reviewed", "Only a pending request can be reviewed.")
    now = datetime.now(UTC)
    row.approver_user_id = approver_user_id
    row.approver_comment = comment
    row.updated_at = now
    if not approve:
        row.status = "REJECTED"
        await session.flush()
        return row

    assert_inside_day(row.calendar_date, row.requested_in)
    assert_inside_day(row.calendar_date, row.requested_out)
    payload = {"regularization_id": str(row.id), "in": None if row.requested_in is None else row.requested_in.isoformat(), "out": None if row.requested_out is None else row.requested_out.isoformat()}
    envelope = RawEnvelope(
        id=uuid4(),
        tenant_id=tenant_id,
        source="REGULARIZATION",
        raw_payload=payload,
        payload_hash=compute_payload_hash(payload),
        received_at=now,
    )
    await insert_raw_envelope(session, envelope)
    events = [
        PunchEvent(
            id=uuid4(),
            tenant_id=tenant_id,
            raw_envelope_id=envelope.id,
            employee_id=row.employee_id,
            punch_time=punch_time,
            punch_direction="UNKNOWN",
            source="REGULARIZATION",
            status="ACTIVE",
            created_at=now,
        )
        for punch_time in (row.requested_in, row.requested_out)
        if punch_time is not None
    ]
    await insert_punch_events(session, events)
    await calculate_and_save_daily_attendance(
        session=session,
        tenant_id=tenant_id,
        employee_id=row.employee_id,
        calendar_date=row.calendar_date,
    )
    row.status = "APPROVED"
    await session.flush()
    return row

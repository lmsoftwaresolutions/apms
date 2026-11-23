from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.punch import PunchEvent, RawEnvelope
from app.models.regularization import AttendanceRegularization
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.employees import repository as emp_repo

REQUEST_TYPES = {"MISSED_IN", "MISSED_OUT", "BOTH", "ON_DUTY"}


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
    if await emp_repo.get_employee_by_id(session, tenant_id, employee_id) is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
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

    envelope = RawEnvelope(
        id=uuid4(),
        tenant_id=tenant_id,
        source="REGULARIZATION",
        raw_payload={"regularization_id": str(row.id)},
        payload_hash=uuid4().hex,
        received_at=now,
    )
    session.add(envelope)
    await session.flush()
    for punch_time in (row.requested_in, row.requested_out):
        if punch_time is None:
            continue
        session.add(
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
        )
    await session.flush()
    await calculate_and_save_daily_attendance(
        session=session,
        tenant_id=tenant_id,
        employee_id=row.employee_id,
        calendar_date=row.calendar_date,
    )
    row.status = "APPROVED"
    await session.flush()
    return row

from datetime import UTC, date, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.policy import PolicyMaster
from app.models.work_mode import WorkModeRequest
from app.modules.employees.repository import get_employee_by_id
from app.modules.work_modes.repository import (
    count_approved_wfh_days_in_month,
    get_work_mode_by_date_session,
    get_work_mode_request,
    insert_work_mode_request,
    list_work_mode_requests,
)
from app.modules.work_modes.schemas import WorkModeApply


def work_mode_coverage(rows: list[WorkModeRequest]) -> tuple[str | None, str | None]:
    """Return the mode and how much of the day it covers: FULL, FIRST_HALF, SECOND_HALF, or BOTH."""
    if not rows:
        return None, None
    full = next((row for row in rows if row.session_target == "FULL"), None)
    if full is not None:
        return full.work_mode, "FULL"
    targets = {row.session_target for row in rows}
    mode = "WFH" if any(row.work_mode == "WFH" for row in rows) else rows[0].work_mode
    if {"FIRST_HALF", "SECOND_HALF"} <= targets:
        return mode, "BOTH"
    return mode, rows[0].session_target


async def _recalculate_day(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> None:
    """Refresh the day when a roster exists. A missing shift must not fail the request."""
    from app.modules.attendance.service import calculate_and_save_daily_attendance

    try:
        await calculate_and_save_daily_attendance(session, tenant_id, employee_id, calendar_date)
    except ProblemError:
        return


async def resolve_employee_policy(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    calendar_date: date,
) -> PolicyMaster | None:
    from app.modules.policies.repository import get_policy
    from app.modules.roster.repository import list_dated_shift_instances
    from app.modules.shifts.repository import get_shift_template_by_id

    instances = await list_dated_shift_instances(
        session, tenant_id, employee_id=employee_id, start_date=calendar_date, end_date=calendar_date
    )
    if instances and instances[0].shift_template_id:
        tpl = await get_shift_template_by_id(session, tenant_id, instances[0].shift_template_id)
        if tpl and tpl.policy_id:
            return await get_policy(session, tenant_id, tpl.policy_id)

    return None


async def apply_work_mode(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    payload: WorkModeApply,
) -> WorkModeRequest:
    emp = await get_employee_by_id(session, tenant_id, employee_id)
    if emp is None:
        raise ProblemError(404, "Employee not found", "The employee is not in this tenant.")

    existing = await get_work_mode_by_date_session(
        session, tenant_id, employee_id, payload.calendar_date, payload.session_target
    )
    if existing is not None:
        raise ProblemError(
            409,
            "Duplicate work mode request",
            f"A work mode request already exists for {payload.calendar_date} ({payload.session_target}).",
        )

    policy = await resolve_employee_policy(session, tenant_id, employee_id, payload.calendar_date)
    from app.modules.policies.resolver import resolve_effective_policy
    effective_pol = await resolve_effective_policy(session, tenant_id, employee_id, base_policy=policy)

    if payload.work_mode == "WFH":
        if not effective_pol.allow_wfh:
            raise ProblemError(
                422,
                "Work From Home disabled",
                "Work From Home is disabled for this employee/department/role",
            )

        quota = effective_pol.wfh_monthly_auto_quota
        used_days = await count_approved_wfh_days_in_month(
            session, tenant_id, employee_id, payload.calendar_date.year, payload.calendar_date.month
        )
        if used_days < quota:
            status = "APPROVED"
            is_auto_approved = True
            decision_reason = "Auto-approved within monthly policy quota"
        else:
            status = "PENDING"
            is_auto_approved = False
            decision_reason = None
    else:  # ON_DUTY
        status = "PENDING"
        is_auto_approved = False
        decision_reason = None

    now = datetime.now(UTC)
    row = WorkModeRequest(
        id=uuid4(),
        tenant_id=tenant_id,
        employee_id=employee_id,
        work_mode=payload.work_mode,
        calendar_date=payload.calendar_date,
        session_target=payload.session_target,
        reason=payload.reason.strip(),
        status=status,
        is_auto_approved=is_auto_approved,
        approver_user_id=None,
        decision_reason=decision_reason,
        created_at=now,
        updated_at=now,
    )
    created = await insert_work_mode_request(session, row)

    if created.status == "APPROVED":
        await _recalculate_day(session, tenant_id, employee_id, payload.calendar_date)

    return created


async def review_work_mode(
    session: AsyncSession,
    tenant_id: UUID,
    request_id: UUID,
    approve: bool,
    approver_user_id: UUID,
    decision_reason: str | None = None,
) -> WorkModeRequest:
    req = await get_work_mode_request(session, tenant_id, request_id)
    if req is None:
        raise ProblemError(404, "Work mode request not found", "The request was not found in this tenant.")

    if req.status != "PENDING":
        raise ProblemError(409, "Request already reviewed", f"Work mode request is already {req.status}.")

    if not approve and (not decision_reason or not decision_reason.strip()):
        raise ProblemError(422, "Decision reason required", "Rejection requires a decision reason.")

    now = datetime.now(UTC)
    req.status = "APPROVED" if approve else "REJECTED"
    req.approver_user_id = approver_user_id
    req.decision_reason = decision_reason.strip() if decision_reason else None
    req.updated_at = now
    await session.flush()

    if req.status == "APPROVED":
        await _recalculate_day(session, tenant_id, req.employee_id, req.calendar_date)

    return req


async def list_requests(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    status: str | None = None,
    calendar_date: date | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[WorkModeRequest]:
    return await list_work_mode_requests(
        session,
        tenant_id,
        employee_id=employee_id,
        status=status,
        calendar_date=calendar_date,
        start_date=start_date,
        end_date=end_date,
    )

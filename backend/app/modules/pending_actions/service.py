from datetime import UTC, date, datetime, timedelta
from uuid import UUID

from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.employee import Employee
from app.models.pending_action import PendingAction
from app.modules.departments.repository import get_department_by_id
from app.modules.designations.repository import get_designation_by_id
from app.modules.pending_actions.schemas import PendingActionOut, PendingActionResolveInput

CONFIRM_EMPLOYMENT_TYPES = frozenset({"FULL_TIME", "CONTRACTOR"})


async def scan_probation_expiries(session: AsyncSession, tenant_id: UUID) -> int:
    """Scan active probation employees whose probation period is expiring or overdue.
    
    Creates idempotent pending_actions so administrators receive warnings and can confirm,
    extend, or transition the employee.
    """
    today = date.today()
    horizon = today + timedelta(days=14)

    # Find probationers whose probation_end_date is within horizon or overdue
    stmt = (
        select(Employee)
        .where(
            and_(
                Employee.tenant_id == tenant_id,
                Employee.is_active.is_(True),
                Employee.employment_type == "PROBATION",
                Employee.probation_end_date.is_not(None),
                Employee.probation_end_date <= horizon,
            )
        )
    )
    result = await session.execute(stmt)
    probationers = result.scalars().all()

    created_count = 0
    for emp in probationers:
        assert emp.probation_end_date is not None
        existing_stmt = select(PendingAction).where(
            and_(
                PendingAction.tenant_id == tenant_id,
                PendingAction.subject_id == emp.id,
                PendingAction.action_type == "PROBATION_EXPIRY",
                PendingAction.status.in_(("PENDING", "DISMISSED")),
            )
        )
        existing_rows = list((await session.execute(existing_stmt)).scalars().all())
        pending = next((row for row in existing_rows if row.status == "PENDING"), None)
        if pending is not None:
            if pending.due_date != emp.probation_end_date:
                pending.due_date = emp.probation_end_date
                pending.priority = "HIGH" if emp.probation_end_date < today else "MEDIUM"
            continue
        if any(row.due_date == emp.probation_end_date for row in existing_rows):
            continue

        priority = "HIGH" if emp.probation_end_date < today else "MEDIUM"
        action = PendingAction(
            tenant_id=tenant_id,
            action_type="PROBATION_EXPIRY",
            subject_type="EMPLOYEE",
            subject_id=emp.id,
            due_date=emp.probation_end_date,
            priority=priority,
            title=f"Probation Review: {emp.full_name} ({emp.employee_code})",
            description=(
                f"Probation period ends on {emp.probation_end_date.isoformat()}. "
                f"Action required: confirm permanent employment, extend probation, or transition department."
            ),
            metadata_json={
                "employee_id": str(emp.id),
                "employee_code": emp.employee_code,
                "full_name": emp.full_name,
                "date_of_joining": emp.date_of_joining.isoformat() if emp.date_of_joining else None,
                "probation_end_date": emp.probation_end_date.isoformat(),
                "branch_id": str(emp.branch_id),
                "department_id": str(emp.department_id) if emp.department_id else None,
                "designation_id": str(emp.designation_id) if emp.designation_id else None,
            },
        )
        session.add(action)
        created_count += 1

    if created_count > 0:
        await session.flush()
    return created_count


async def list_pending_actions(
    session: AsyncSession,
    tenant_id: UUID,
    status: str | None = None,
    action_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[PendingActionOut]:
    """Scan and list pending actions for the given tenant."""
    # Always scan on query so real-time status is preserved
    await scan_probation_expiries(session, tenant_id)

    today = date.today()
    filters = [PendingAction.tenant_id == tenant_id]

    if status and status.upper() != "ALL":
        filters.append(PendingAction.status == status.upper())
    else:
        # Default to PENDING if not specified
        if status is None:
            filters.append(PendingAction.status == "PENDING")

    if action_type:
        filters.append(PendingAction.action_type == action_type.upper())

    stmt = (
        select(PendingAction)
        .where(and_(*filters))
        .order_by(
            PendingAction.status.asc(),
            PendingAction.due_date.asc(),
            PendingAction.created_at.desc(),
        )
        .limit(limit)
        .offset(offset)
    )
    result = await session.execute(stmt)
    records = result.scalars().all()

    items = []
    for r in records:
        days_rem = (r.due_date - today).days if r.due_date else None
        item = PendingActionOut.model_validate(r)
        item.days_remaining = days_rem
        items.append(item)
    return items


async def count_pending_actions(session: AsyncSession, tenant_id: UUID) -> dict[str, int]:
    """Count pending, overdue, and due-soon actions for the tenant."""
    await scan_probation_expiries(session, tenant_id)
    today = date.today()
    soon_cutoff = today + timedelta(days=7)

    stmt = select(PendingAction).where(
        and_(PendingAction.tenant_id == tenant_id, PendingAction.status == "PENDING")
    )
    result = await session.execute(stmt)
    pending_list = result.scalars().all()

    total_pending = len(pending_list)
    overdue = sum(1 for a in pending_list if a.due_date < today)
    due_soon = sum(1 for a in pending_list if today <= a.due_date <= soon_cutoff)

    return {
        "pending": total_pending,
        "overdue": overdue,
        "due_soon": due_soon,
    }


async def _require_active_department(
    session: AsyncSession,
    tenant_id: UUID,
    department_id: UUID,
    branch_id: UUID,
) -> None:
    dept = await get_department_by_id(session, tenant_id, department_id)
    if dept is None:
        raise ProblemError(400, "Invalid department", "Department does not exist in this tenant.")
    if dept.branch_id != branch_id:
        raise ProblemError(400, "Invalid department", "Department must belong to the employee's branch.")
    if not dept.is_active:
        raise ProblemError(400, "Inactive department", "Cannot assign employee to a deactivated department.")


async def _require_active_designation(
    session: AsyncSession,
    tenant_id: UUID,
    designation_id: UUID,
    department_id: UUID | None,
) -> None:
    desig = await get_designation_by_id(session, tenant_id, designation_id)
    if desig is None:
        raise ProblemError(400, "Invalid designation", "Designation does not exist in this tenant.")
    if not desig.is_active:
        raise ProblemError(400, "Inactive designation", "Cannot assign an inactive designation.")
    if department_id is None or desig.department_id != department_id:
        raise ProblemError(400, "Invalid designation", "Designation does not belong to the employee's department.")


async def resolve_pending_action(
    session: AsyncSession,
    tenant_id: UUID,
    user_id: UUID,
    action_id: UUID,
    payload: PendingActionResolveInput,
) -> PendingActionOut:
    """Resolve or dismiss a pending action."""
    today = date.today()
    stmt = select(PendingAction).where(
        and_(PendingAction.tenant_id == tenant_id, PendingAction.id == action_id)
    )
    action = (await session.execute(stmt)).scalar_one_or_none()
    if not action:
        raise ProblemError(404, "Pending action not found", f"No action with ID {action_id}")

    if action.status != "PENDING":
        raise ProblemError(400, "Action already resolved", f"Action is already {action.status}")

    act_verb = payload.action.upper()
    if act_verb not in ("CONFIRM", "EXTEND", "DISMISS"):
        raise ProblemError(400, "Invalid resolution action", f"Unknown action: {payload.action}")

    # Handle probation expiry specific resolution
    if action.action_type == "PROBATION_EXPIRY" and action.subject_type == "EMPLOYEE":
        emp_stmt = select(Employee).where(
            and_(Employee.tenant_id == tenant_id, Employee.id == action.subject_id)
        )
        emp = (await session.execute(emp_stmt)).scalar_one_or_none()
        if emp:
            if act_verb == "CONFIRM":
                target_type = payload.target_employment_type or "FULL_TIME"
                if target_type not in CONFIRM_EMPLOYMENT_TYPES:
                    raise ProblemError(
                        400,
                        "Invalid employment type",
                        "Confirmation must set the employment type to full time or contractor.",
                    )
                department_id = payload.target_department_id or emp.department_id
                if payload.target_department_id is not None:
                    await _require_active_department(session, tenant_id, payload.target_department_id, emp.branch_id)
                if payload.target_designation_id is not None:
                    await _require_active_designation(
                        session, tenant_id, payload.target_designation_id, department_id
                    )
                emp.employment_type = target_type
                emp.confirmation_date = today
                if payload.target_department_id:
                    emp.department_id = payload.target_department_id
                if payload.target_designation_id:
                    emp.designation_id = payload.target_designation_id
                action.status = "RESOLVED"
            elif act_verb == "EXTEND":
                if not payload.new_end_date:
                    raise ProblemError(400, "New end date required", "new_end_date must be provided when extending probation.")
                if payload.new_end_date <= today:
                    raise ProblemError(400, "Invalid end date", "New probation end date must be in the future.")
                emp.probation_end_date = payload.new_end_date
                action.status = "RESOLVED"
            elif act_verb == "DISMISS":
                action.status = "DISMISSED"

    action.resolved_by = user_id
    action.resolved_at = datetime.now(UTC)
    action.resolution = payload.model_dump(mode="json")

    await session.flush()
    await session.refresh(action)

    days_rem = (action.due_date - today).days if action.due_date else None
    out = PendingActionOut.model_validate(action)
    out.days_remaining = days_rem
    return out

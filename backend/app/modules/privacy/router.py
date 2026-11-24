from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.core.errors import ProblemError
from app.modules.employees import repository as emp_repo
from app.modules.privacy.repository import list_consent_events

router = APIRouter(prefix="/privacy", tags=["privacy"])


@router.get("/consent")
async def consent(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("privacy.consent.read"))],
    employee_id: Annotated[UUID, Query()],
) -> list[dict[str, str | None]]:
    employee = await emp_repo.get_employee_by_id(session, current.tenant_id, employee_id)
    if employee is None:
        raise ProblemError(404, "Employee not found", "No employee with that id exists in this tenant.")
    rows = await list_consent_events(session, current.tenant_id, employee_id)
    return [
        {
            "id": str(row.id),
            "employee_id": str(row.employee_id),
            "action": row.action,
            "purpose": row.purpose,
            "retention": row.retention,
            "recorded_at": row.recorded_at.isoformat(),
        }
        for row in rows
    ]

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.modules.pending_actions.schemas import (
    PendingActionCountOut,
    PendingActionOut,
    PendingActionResolveInput,
)
from app.modules.pending_actions.service import (
    count_pending_actions,
    list_pending_actions,
    resolve_pending_action,
    scan_probation_expiries,
)

router = APIRouter(prefix="/pending-actions", tags=["pending-actions"])


@router.get("", response_model=list[PendingActionOut])
async def get_pending_actions(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("pending_action:read"))],
    status_filter: str | None = Query(default=None, alias="status"),
    action_type: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> list[PendingActionOut]:
    """List pending actions (alerts, probation expiries, approval warnings) for current tenant."""
    return await list_pending_actions(
        session,
        current.tenant_id,
        status=status_filter,
        action_type=action_type,
        limit=limit,
        offset=offset,
    )


@router.get("/count", response_model=PendingActionCountOut)
async def get_pending_actions_count(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("pending_action:read"))],
) -> PendingActionCountOut:
    """Get live pending, overdue, and due-soon action counts for sidebar/topbar badge."""
    res = await count_pending_actions(session, current.tenant_id)
    return PendingActionCountOut(**res)


@router.post("/scan", response_model=dict)
async def scan_actions(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("pending_action:update"))],
) -> dict:
    """Manually trigger background alert scan for probation expiries and milestones."""
    created = await scan_probation_expiries(session, current.tenant_id)
    return {"status": "ok", "new_actions_created": created}


@router.post("/{action_id}/resolve", response_model=PendingActionOut)
async def resolve_action(
    action_id: UUID,
    payload: PendingActionResolveInput,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("pending_action:update"))],
) -> PendingActionOut:
    """Resolve a pending action (e.g. Confirm employee, Extend probation, or Dismiss warning)."""
    return await resolve_pending_action(
        session,
        current.tenant_id,
        current.user.id,
        action_id,
        payload,
    )

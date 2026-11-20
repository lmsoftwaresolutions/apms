from datetime import date
from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.modules.roster import service as roster_service
from app.modules.roster.schemas import (
    AdHocOverrideRequest,
    CancelShiftRequest,
    DatedShiftInstanceRead,
    MaterializeRosterRequest,
    MaterializeRosterResponse,
    RosterPatternCreate,
    RosterPatternRead,
)

router = APIRouter(prefix="/roster", tags=["roster"])


@router.post(
    "/patterns",
    response_model=RosterPatternRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a repeating roster rotation pattern",
)
async def create_pattern(
    payload: RosterPatternCreate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.pattern.create"))],
) -> RosterPatternRead:
    return await roster_service.create_pattern(session, current.tenant_id, payload)


@router.get(
    "/patterns",
    response_model=list[RosterPatternRead],
    summary="List roster patterns",
)
async def list_patterns(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.pattern.read"))],
) -> list[RosterPatternRead]:
    return await roster_service.list_patterns(session, current.tenant_id)


@router.get(
    "/patterns/{pattern_id}",
    response_model=RosterPatternRead,
    summary="Get roster pattern by ID",
)
async def get_pattern(
    pattern_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.pattern.read"))],
) -> RosterPatternRead:
    return await roster_service.get_pattern(session, current.tenant_id, pattern_id)


@router.post(
    "/materialize",
    response_model=MaterializeRosterResponse,
    status_code=status.HTTP_201_CREATED,
    summary="Materialize concrete 30-day dated shift instances (ADR-15)",
)
async def materialize(
    payload: MaterializeRosterRequest,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.instance.create"))],
) -> MaterializeRosterResponse:
    return await roster_service.materialize_roster(session, current.tenant_id, payload)


@router.get(
    "/instances",
    response_model=list[DatedShiftInstanceRead],
    summary="List dated shift instances by employee and date range",
)
async def list_instances(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.instance.read"))],
    employee_id: Annotated[UUID | None, Query(description="Filter by employee")] = None,
    start_date: Annotated[date | None, Query(description="Filter from date")] = None,
    end_date: Annotated[date | None, Query(description="Filter to date")] = None,
) -> list[DatedShiftInstanceRead]:
    return await roster_service.list_instances(
        session, current.tenant_id, employee_id, start_date, end_date
    )


@router.get(
    "/instances/{instance_id}",
    response_model=DatedShiftInstanceRead,
    summary="Get dated shift instance by ID",
)
async def get_instance(
    instance_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.instance.read"))],
) -> DatedShiftInstanceRead:
    return await roster_service.get_instance(session, current.tenant_id, instance_id)


@router.put(
    "/instances/{instance_id}/override",
    response_model=DatedShiftInstanceRead,
    summary="Ad-hoc same-day supervisor schedule override (Confirmed N67)",
)
async def override_instance(
    instance_id: UUID,
    payload: AdHocOverrideRequest,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.instance.update"))],
) -> DatedShiftInstanceRead:
    return await roster_service.override_shift_instance(
        session, current.tenant_id, instance_id, payload, current_user_id=current.user.id
    )


@router.put(
    "/instances/{instance_id}/cancel",
    response_model=DatedShiftInstanceRead,
    summary="Employer cancellation of scheduled shift session (Confirmed N66d, ROS-10)",
)
async def cancel_instance(
    instance_id: UUID,
    payload: CancelShiftRequest,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("roster.instance.update"))],
) -> DatedShiftInstanceRead:
    return await roster_service.cancel_shift_instance(
        session, current.tenant_id, instance_id, payload, current_user_id=current.user.id
    )

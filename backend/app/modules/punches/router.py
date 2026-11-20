from datetime import datetime
from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.modules.punches.repository import list_punch_events
from app.modules.punches.schemas import (
    PunchEventRead,
    PunchIngestRequest,
    PunchIngestResult,
)
from app.modules.punches.service import process_and_ingest_punches

router = APIRouter(prefix="/punches", tags=["punches"])


@router.post(
    "/ingest",
    response_model=PunchIngestResult,
    status_code=status.HTTP_201_CREATED,
    summary="Ingest raw punch payload from device or import",
)
async def ingest_punches_endpoint(
    body: PunchIngestRequest,
    session: SessionDep,
    response: Response,
    current: Annotated[CurrentUser, Depends(require_permission("capture.punch.ingest"))],
) -> PunchIngestResult:
    result = await process_and_ingest_punches(
        session=session,
        tenant_id=current.tenant_id,
        source=body.source,
        raw_payload=body.raw_payload,
        device_identifier=body.device_identifier,
    )
    if result.is_duplicate:
        response.status_code = status.HTTP_200_OK
    return result


@router.post(
    "/etime",
    response_model=PunchIngestResult,
    status_code=status.HTTP_201_CREATED,
    summary="Convenience endpoint for eTime / eSSL JSON push",
)
async def ingest_etime_endpoint(
    body: dict[str, Any],
    session: SessionDep,
    response: Response,
    current: Annotated[CurrentUser, Depends(require_permission("capture.punch.ingest"))],
) -> PunchIngestResult:
    result = await process_and_ingest_punches(
        session=session,
        tenant_id=current.tenant_id,
        source="ETIMEOFFICE",
        raw_payload=body,
        device_identifier="etime_web_api",
    )
    if result.is_duplicate:
        response.status_code = status.HTTP_200_OK
    return result


@router.get(
    "",
    response_model=list[PunchEventRead],
    summary="List punch events for tenant (ENH-01)",
)
async def list_punches_endpoint(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("capture.punch.read"))],
    employee_id: Annotated[UUID | None, Query()] = None,
    start_time: Annotated[datetime | None, Query()] = None,
    end_time: Annotated[datetime | None, Query()] = None,
    status_filter: Annotated[str | None, Query(alias="status")] = None,
    limit: Annotated[int, Query(ge=1, le=500)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> list[PunchEventRead]:
    events = await list_punch_events(
        session=session,
        tenant_id=current.tenant_id,
        employee_id=employee_id,
        start_time=start_time,
        end_time=end_time,
        status=status_filter,
        limit=limit,
        offset=offset,
    )
    return [
        PunchEventRead(
            id=e.id,
            tenant_id=e.tenant_id,
            raw_envelope_id=e.raw_envelope_id,
            employee_id=e.employee_id,
            punch_time=e.punch_time,
            punch_direction=e.punch_direction,
            source=e.source,
            status=e.status,
            location_meta=e.location_meta,
            created_at=e.created_at,
        )
        for e in events
    ]

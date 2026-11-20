from typing import Annotated, Any
from uuid import UUID

from fastapi import APIRouter, Depends, Query, status

from app.api.deps import CurrentUser, SessionDep, require_permission
from app.modules.punches.schemas import PunchIngestRequest, PunchIngestResult
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
    current: Annotated[CurrentUser, Depends(require_permission("capture.punch.ingest"))],
) -> PunchIngestResult:
    result = await process_and_ingest_punches(
        session=session,
        tenant_id=current.tenant_id,
        source=body.source,
        raw_payload=body.raw_payload,
        device_identifier=body.device_identifier,
    )
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
    current: Annotated[CurrentUser, Depends(require_permission("capture.punch.ingest"))],
) -> PunchIngestResult:
    result = await process_and_ingest_punches(
        session=session,
        tenant_id=current.tenant_id,
        source="ETIMEOFFICE",
        raw_payload=body,
        device_identifier="etime_web_api",
    )
    return result

from typing import Annotated
from uuid import UUID

from fastapi import APIRouter, Depends, Query, Response, status

from app.api.deps import CurrentUser, IdempotencyDep, SessionDep, require_permission
from app.modules.shifts import service as shift_service
from app.modules.shifts.schemas import (
    ShiftTemplateCreate,
    ShiftTemplateRead,
    ShiftTemplateUpdate,
)
from app.services.idempotency import replay_or_reserve, store_response

router = APIRouter(prefix="/shifts", tags=["shifts"])


@router.post(
    "/templates",
    response_model=ShiftTemplateRead,
    status_code=status.HTTP_201_CREATED,
    summary="Create a shift template",
)
async def create_template(
    payload: ShiftTemplateCreate,
    response: Response,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("shift.template.create"))],
    idempotency_key: IdempotencyDep,
) -> ShiftTemplateRead:
    body_in = payload.model_dump(mode="json")
    replay = await replay_or_reserve(
        session, current.tenant_id, idempotency_key, "/api/v1/shifts/templates", body_in
    )
    if replay:
        response.status_code = int(replay["status_code"])
        return ShiftTemplateRead.model_validate(replay["body"])

    created = await shift_service.create_template(session, current.tenant_id, payload)
    await store_response(
        session,
        current.tenant_id,
        idempotency_key,
        "/api/v1/shifts/templates",
        body_in,
        status.HTTP_201_CREATED,
        created.model_dump(mode="json"),
    )
    return created


@router.get(
    "/templates",
    response_model=list[ShiftTemplateRead],
    summary="List shift templates",
)
async def list_templates(
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("shift.template.read"))],
    active_only: Annotated[bool, Query(description="Filter active templates only")] = False,
) -> list[ShiftTemplateRead]:
    return await shift_service.list_templates(
        session, current.tenant_id, active_only=active_only
    )


@router.get(
    "/templates/{template_id}",
    response_model=ShiftTemplateRead,
    summary="Get shift template by ID",
)
async def get_template(
    template_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("shift.template.read"))],
) -> ShiftTemplateRead:
    return await shift_service.get_template(session, current.tenant_id, template_id)


@router.put(
    "/templates/{template_id}",
    response_model=ShiftTemplateRead,
    summary="Update shift template",
)
async def update_template(
    template_id: UUID,
    payload: ShiftTemplateUpdate,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("shift.template.update"))],
) -> ShiftTemplateRead:
    return await shift_service.update_template(
        session, current.tenant_id, template_id, payload
    )


@router.delete(
    "/templates/{template_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete shift template",
)
async def delete_template(
    template_id: UUID,
    session: SessionDep,
    current: Annotated[CurrentUser, Depends(require_permission("shift.template.delete"))],
) -> None:
    await shift_service.delete_template(session, current.tenant_id, template_id)

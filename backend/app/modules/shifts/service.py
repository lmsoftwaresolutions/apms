from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import set_tenant
from app.models.shift import ShiftSession, ShiftTemplate
from app.modules.shifts.repository import (
    create_shift_template,
    delete_shift_template,
    get_shift_template_by_code,
    get_shift_template_by_id,
    list_shift_templates,
    update_shift_template,
)
from app.modules.shifts.schemas import (
    ShiftSessionCreate,
    ShiftTemplateCreate,
    ShiftTemplateRead,
    ShiftTemplateUpdate,
)


def _validate_and_build_sessions(
    tenant_id: UUID,
    template_id: UUID,
    sessions_in: list[ShiftSessionCreate],
) -> tuple[list[ShiftSession], bool]:
    if not sessions_in:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Shift template must contain at least one session.",
        )

    # Sort sessions by session_order
    sorted_sessions = sorted(sessions_in, key=lambda s: s.session_order)

    # Check for duplicate session orders
    orders = [s.session_order for s in sorted_sessions]
    if len(orders) != len(set(orders)):
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Session orders must be distinct.",
        )

    # Check for overlaps if all on the same calendar day
    is_template_overnight = False
    now = datetime.now(timezone.utc)
    models: list[ShiftSession] = []

    for i, s in enumerate(sorted_sessions):
        is_session_overnight = s.end_time < s.start_time
        if is_session_overnight:
            is_template_overnight = True

        if i > 0 and not is_template_overnight:
            prev = sorted_sessions[i - 1]
            if prev.end_time > s.start_time:
                raise HTTPException(
                    status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                    detail=f"Session {prev.session_order} overlaps with session {s.session_order}.",
                )

        models.append(
            ShiftSession(
                id=uuid4(),
                tenant_id=tenant_id,
                shift_template_id=template_id,
                session_order=s.session_order,
                name=s.name,
                start_time=s.start_time,
                end_time=s.end_time,
                pre_window_minutes=s.pre_window_minutes,
                post_window_minutes=s.post_window_minutes,
                grace_period_late_minutes=s.grace_period_late_minutes,
                grace_period_early_minutes=s.grace_period_early_minutes,
                min_presence_ratio=s.min_presence_ratio,
                break_duration_minutes=s.break_duration_minutes,
                is_overnight=is_session_overnight,
                created_at=now,
            )
        )

    return models, is_template_overnight


async def create_template(
    session: AsyncSession,
    tenant_id: UUID,
    payload: ShiftTemplateCreate,
) -> ShiftTemplateRead:
    await set_tenant(session, tenant_id)

    existing = await get_shift_template_by_code(session, tenant_id, payload.code)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Shift template with code '{payload.code}' already exists.",
        )

    template_id = uuid4()
    now = datetime.now(timezone.utc)

    session_models, is_overnight = _validate_and_build_sessions(
        tenant_id=tenant_id,
        template_id=template_id,
        sessions_in=payload.sessions,
    )

    shift_type = payload.shift_type.upper()
    if is_overnight and shift_type != "OVERNIGHT":
        shift_type = "OVERNIGHT"

    template = ShiftTemplate(
        id=template_id,
        tenant_id=tenant_id,
        code=payload.code,
        name=payload.name,
        shift_type=shift_type,
        is_overnight=is_overnight,
        is_active=True,
        color_code=payload.color_code,
        created_at=now,
        updated_at=now,
    )

    created = await create_shift_template(session, tenant_id, template, session_models)
    return ShiftTemplateRead.model_validate(created)


async def get_template(
    session: AsyncSession,
    tenant_id: UUID,
    template_id: UUID,
) -> ShiftTemplateRead:
    await set_tenant(session, tenant_id)
    template = await get_shift_template_by_id(session, tenant_id, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift template not found.",
        )
    return ShiftTemplateRead.model_validate(template)


async def list_templates(
    session: AsyncSession,
    tenant_id: UUID,
    active_only: bool = False,
) -> list[ShiftTemplateRead]:
    await set_tenant(session, tenant_id)
    templates = await list_shift_templates(session, tenant_id, active_only=active_only)
    return [ShiftTemplateRead.model_validate(t) for t in templates]


async def update_template(
    session: AsyncSession,
    tenant_id: UUID,
    template_id: UUID,
    payload: ShiftTemplateUpdate,
) -> ShiftTemplateRead:
    await set_tenant(session, tenant_id)
    template = await get_shift_template_by_id(session, tenant_id, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift template not found.",
        )

    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.shift_type is not None:
        updates["shift_type"] = payload.shift_type.upper()
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active
    if payload.color_code is not None:
        updates["color_code"] = payload.color_code

    new_session_models = None
    if payload.sessions is not None:
        new_session_models, is_overnight = _validate_and_build_sessions(
            tenant_id=tenant_id,
            template_id=template_id,
            sessions_in=payload.sessions,
        )
        updates["is_overnight"] = is_overnight

    updated = await update_shift_template(
        session, tenant_id, template, updates, new_session_models
    )
    return ShiftTemplateRead.model_validate(updated)


async def delete_template(
    session: AsyncSession,
    tenant_id: UUID,
    template_id: UUID,
) -> None:
    await set_tenant(session, tenant_id)
    template = await get_shift_template_by_id(session, tenant_id, template_id)
    if template is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Shift template not found.",
        )
    await delete_shift_template(session, tenant_id, template)

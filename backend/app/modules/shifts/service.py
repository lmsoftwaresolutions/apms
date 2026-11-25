from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
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
        raise ProblemError(
            422,
            "Invalid sessions",
            "Shift template must contain at least one session.",
        )

    # Sort sessions by session_order
    sorted_sessions = sorted(sessions_in, key=lambda s: s.session_order)

    # Check for duplicate session orders
    orders = [s.session_order for s in sorted_sessions]
    if len(orders) != len(set(orders)):
        raise ProblemError(
            422,
            "Duplicate session orders",
            "Session orders must be distinct.",
        )

    # Check for overlaps: only skip if either of the two compared sessions straddles midnight
    is_template_overnight = False
    now = datetime.now(timezone.utc)
    models: list[ShiftSession] = []

    for i, s in enumerate(sorted_sessions):
        is_session_overnight = s.end_time < s.start_time
        if is_session_overnight:
            is_template_overnight = True

        if i > 0:
            prev = sorted_sessions[i - 1]
            prev_is_overnight = prev.end_time < prev.start_time
            if not is_session_overnight and not prev_is_overnight:
                if prev.end_time > s.start_time:
                    raise ProblemError(
                        422,
                        "Session overlap",
                        f"Session {prev.session_order} overlaps with session {s.session_order}.",
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
    existing = await get_shift_template_by_code(session, tenant_id, payload.code)
    if existing is not None:
        raise ProblemError(
            409,
            "Shift template code conflict",
            f"Shift template with code '{payload.code}' already exists.",
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

    if payload.policy_id is not None:
        from app.modules.policies.repository import get_policy
        pol = await get_policy(session, tenant_id, payload.policy_id)
        if pol is None:
            raise ProblemError(
                404,
                "Policy not found",
                f"Policy with ID '{payload.policy_id}' does not exist in this tenant.",
            )
        if not pol.is_active:
            raise ProblemError(
                400,
                "Inactive policy",
                "Cannot attach a deactivated attendance policy to a shift template.",
            )

    template = ShiftTemplate(
        id=template_id,
        tenant_id=tenant_id,
        policy_id=payload.policy_id,
        code=payload.code,
        name=payload.name,
        shift_type=shift_type,
        is_overnight=is_overnight,
        is_active=True,
        color_code=payload.color_code,
        created_at=now,
        updated_at=now,
    )

    try:
        created = await create_shift_template(session, tenant_id, template, session_models)
    except IntegrityError as exc:
        raise ProblemError(
            409,
            "Shift template code conflict",
            f"Shift template with code '{payload.code}' already exists.",
        ) from exc

    return ShiftTemplateRead.model_validate(created)


async def get_template(
    session: AsyncSession,
    tenant_id: UUID,
    template_id: UUID,
) -> ShiftTemplateRead:
    template = await get_shift_template_by_id(session, tenant_id, template_id)
    if template is None:
        raise ProblemError(
            404,
            "Shift template not found",
            "No shift template with that id exists in this tenant.",
        )
    return ShiftTemplateRead.model_validate(template)


async def list_templates(
    session: AsyncSession,
    tenant_id: UUID,
    active_only: bool = False,
) -> list[ShiftTemplateRead]:
    templates = await list_shift_templates(session, tenant_id, active_only=active_only)
    return [ShiftTemplateRead.model_validate(t) for t in templates]


async def update_template(
    session: AsyncSession,
    tenant_id: UUID,
    template_id: UUID,
    payload: ShiftTemplateUpdate,
) -> ShiftTemplateRead:
    template = await get_shift_template_by_id(session, tenant_id, template_id)
    if template is None:
        raise ProblemError(
            404,
            "Shift template not found",
            "No shift template with that id exists in this tenant.",
        )

    updates: dict[str, Any] = {"updated_at": datetime.now(timezone.utc)}
    if payload.name is not None:
        updates["name"] = payload.name
    if payload.is_active is not None:
        updates["is_active"] = payload.is_active
    if "color_code" in payload.model_fields_set:
        updates["color_code"] = payload.color_code
    if "policy_id" in payload.model_fields_set:
        if payload.policy_id is not None:
            from app.modules.policies.repository import get_policy
            pol = await get_policy(session, tenant_id, payload.policy_id)
            if pol is None:
                raise ProblemError(
                    404,
                    "Policy not found",
                    f"Policy with ID '{payload.policy_id}' does not exist in this tenant.",
                )
            if (payload.policy_id != template.policy_id or (payload.is_active is True and not template.is_active)) and not pol.is_active:
                raise ProblemError(
                    400,
                    "Inactive policy",
                    "Cannot attach a deactivated attendance policy to a shift template.",
                )
        updates["policy_id"] = payload.policy_id
    elif payload.is_active is True and not template.is_active and template.policy_id is not None:
        from app.modules.policies.repository import get_policy
        pol = await get_policy(session, tenant_id, template.policy_id)
        if pol is not None and not pol.is_active:
            raise ProblemError(
                400,
                "Inactive policy",
                "Cannot activate a shift template attached to a deactivated attendance policy.",
            )

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
    template = await get_shift_template_by_id(session, tenant_id, template_id)
    if template is None:
        raise ProblemError(
            404,
            "Shift template not found",
            "No shift template with that id exists in this tenant.",
        )
    await delete_shift_template(session, tenant_id, template)

from datetime import date, datetime, timedelta, timezone
from typing import Any
from uuid import UUID, uuid4

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import set_tenant
from app.models.roster import DatedShiftInstance, RosterPattern
from app.models.shift import ShiftTemplate
from app.modules.roster.repository import (
    create_roster_pattern,
    get_dated_shift_instance_by_employee_and_date,
    get_dated_shift_instance_by_id,
    get_roster_pattern_by_code,
    get_roster_pattern_by_id,
    list_dated_shift_instances,
    list_roster_patterns,
    save_dated_shift_instance,
)
from app.modules.roster.schemas import (
    AdHocOverrideRequest,
    CancelShiftRequest,
    DatedShiftInstanceRead,
    MaterializeRosterRequest,
    MaterializeRosterResponse,
    RosterPatternCreate,
    RosterPatternRead,
)
from app.modules.shifts.repository import get_shift_template_by_id


def _snapshot_template_sessions(template: ShiftTemplate) -> list[dict[str, Any]]:
    return [
        {
            "session_order": s.session_order,
            "name": s.name,
            "start_time": s.start_time.strftime("%H:%M:%S"),
            "end_time": s.end_time.strftime("%H:%M:%S"),
            "pre_window_minutes": s.pre_window_minutes,
            "post_window_minutes": s.post_window_minutes,
            "grace_period_late_minutes": s.grace_period_late_minutes,
            "grace_period_early_minutes": s.grace_period_early_minutes,
            "min_presence_ratio": float(s.min_presence_ratio),
            "break_duration_minutes": s.break_duration_minutes,
            "is_overnight": s.is_overnight,
        }
        for s in template.sessions
    ]


async def create_pattern(
    session: AsyncSession,
    tenant_id: UUID,
    payload: RosterPatternCreate,
) -> RosterPatternRead:
    await set_tenant(session, tenant_id)

    existing = await get_roster_pattern_by_code(session, tenant_id, payload.code)
    if existing is not None:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Roster pattern with code '{payload.code}' already exists.",
        )

    now = datetime.now(timezone.utc)
    pattern = RosterPattern(
        id=uuid4(),
        tenant_id=tenant_id,
        code=payload.code,
        name=payload.name,
        cycle_length_days=payload.cycle_length_days,
        day_shift_mapping=[m.model_dump(mode="json") for m in payload.day_shift_mapping],
        is_active=True,
        created_at=now,
        updated_at=now,
    )
    created = await create_roster_pattern(session, tenant_id, pattern)
    return RosterPatternRead.model_validate(created)


async def get_pattern(
    session: AsyncSession,
    tenant_id: UUID,
    pattern_id: UUID,
) -> RosterPatternRead:
    await set_tenant(session, tenant_id)
    pattern = await get_roster_pattern_by_id(session, tenant_id, pattern_id)
    if pattern is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Roster pattern not found.",
        )
    return RosterPatternRead.model_validate(pattern)


async def list_patterns(
    session: AsyncSession,
    tenant_id: UUID,
) -> list[RosterPatternRead]:
    await set_tenant(session, tenant_id)
    patterns = await list_roster_patterns(session, tenant_id)
    return [RosterPatternRead.model_validate(p) for p in patterns]


async def materialize_roster(
    session: AsyncSession,
    tenant_id: UUID,
    payload: MaterializeRosterRequest,
) -> MaterializeRosterResponse:
    await set_tenant(session, tenant_id)

    if payload.shift_template_id is None and payload.roster_pattern_id is None:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
            detail="Either shift_template_id or roster_pattern_id must be provided.",
        )

    template_cache: dict[UUID, ShiftTemplate] = {}

    # Pre-fetch single template if fixed assignment
    single_template: ShiftTemplate | None = None
    if payload.shift_template_id is not None:
        single_template = await get_shift_template_by_id(session, tenant_id, payload.shift_template_id)
        if single_template is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shift template {payload.shift_template_id} not found.",
            )
        template_cache[single_template.id] = single_template

    # Pre-fetch pattern and its referenced templates
    pattern: RosterPattern | None = None
    if payload.roster_pattern_id is not None:
        pattern = await get_roster_pattern_by_id(session, tenant_id, payload.roster_pattern_id)
        if pattern is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Roster pattern {payload.roster_pattern_id} not found.",
            )
        for m in pattern.day_shift_mapping:
            tid = m.get("shift_template_id")
            if tid:
                t_uuid = UUID(tid) if isinstance(tid, str) else tid
                if t_uuid not in template_cache:
                    t = await get_shift_template_by_id(session, tenant_id, t_uuid)
                    if t:
                        template_cache[t_uuid] = t

    total_created = 0
    now = datetime.now(timezone.utc)

    for emp_id in payload.employee_ids:
        for day_idx in range(payload.days):
            current_date = payload.start_date + timedelta(days=day_idx)

            existing = await get_dated_shift_instance_by_employee_and_date(
                session, tenant_id, emp_id, current_date
            )

            # Invariant: Ad-hoc supervisor overrides must never be overwritten by recurrence jobs (ADR-15, N67)
            if existing is not None and existing.is_adhoc_modified:
                continue

            target_template_id: UUID | None = None
            is_rest_day = False
            status_val = "SCHEDULED"
            resolution_mode = "DIRECT_ASSIGNMENT"

            if pattern is not None:
                resolution_mode = "ROSTER_PATTERN"
                offset = day_idx % pattern.cycle_length_days
                mapping_entry = next(
                    (m for m in pattern.day_shift_mapping if m.get("day_index") == offset),
                    None,
                )
                if mapping_entry is None or mapping_entry.get("is_rest_day") or not mapping_entry.get("shift_template_id"):
                    is_rest_day = True
                    status_val = "REST_DAY"
                else:
                    raw_tid = mapping_entry["shift_template_id"]
                    target_template_id = UUID(raw_tid) if isinstance(raw_tid, str) else raw_tid
            elif single_template is not None:
                target_template_id = single_template.id

            sessions_snapshot: list[dict[str, Any]] = []
            if not is_rest_day and target_template_id and target_template_id in template_cache:
                sessions_snapshot = _snapshot_template_sessions(template_cache[target_template_id])

            if existing is not None:
                existing.shift_template_id = target_template_id
                existing.roster_pattern_id = payload.roster_pattern_id
                existing.status = status_val
                existing.resolution_mode = resolution_mode
                existing.sessions = sessions_snapshot
                existing.is_rest_day = is_rest_day
                existing.updated_at = now
                await save_dated_shift_instance(session, tenant_id, existing)
            else:
                new_instance = DatedShiftInstance(
                    id=uuid4(),
                    tenant_id=tenant_id,
                    employee_id=emp_id,
                    calendar_date=current_date,
                    shift_template_id=target_template_id,
                    roster_pattern_id=payload.roster_pattern_id,
                    status=status_val,
                    resolution_mode=resolution_mode,
                    sessions=sessions_snapshot,
                    is_rest_day=is_rest_day,
                    is_adhoc_modified=False,
                    created_at=now,
                    updated_at=now,
                )
                await save_dated_shift_instance(session, tenant_id, new_instance)

            total_created += 1

    return MaterializeRosterResponse(
        total_materialized=total_created,
        employees_count=len(payload.employee_ids),
        start_date=payload.start_date,
        end_date=payload.start_date + timedelta(days=payload.days - 1),
    )


async def get_instance(
    session: AsyncSession,
    tenant_id: UUID,
    instance_id: UUID,
) -> DatedShiftInstanceRead:
    await set_tenant(session, tenant_id)
    instance = await get_dated_shift_instance_by_id(session, tenant_id, instance_id)
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dated shift instance not found.",
        )
    return DatedShiftInstanceRead.model_validate(instance)


async def list_instances(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID | None = None,
    start_date: date | None = None,
    end_date: date | None = None,
) -> list[DatedShiftInstanceRead]:
    await set_tenant(session, tenant_id)
    instances = await list_dated_shift_instances(
        session, tenant_id, employee_id, start_date, end_date
    )
    return [DatedShiftInstanceRead.model_validate(i) for i in instances]


async def override_shift_instance(
    session: AsyncSession,
    tenant_id: UUID,
    instance_id: UUID,
    payload: AdHocOverrideRequest,
    current_user_id: UUID | None = None,
) -> DatedShiftInstanceRead:
    """N67 supervisor direct override: modifies target date's instance without touching recurring templates."""
    await set_tenant(session, tenant_id)
    instance = await get_dated_shift_instance_by_id(session, tenant_id, instance_id)
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dated shift instance not found.",
        )

    now = datetime.now(timezone.utc)
    sessions_snapshot: list[dict[str, Any]] = []

    if payload.is_rest_day:
        instance.shift_template_id = None
        instance.status = "REST_DAY"
        instance.is_rest_day = True
        instance.sessions = []
    else:
        if payload.shift_template_id is None:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_CONTENT,
                detail="shift_template_id is required when is_rest_day is False.",
            )
        template = await get_shift_template_by_id(session, tenant_id, payload.shift_template_id)
        if template is None:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Shift template {payload.shift_template_id} not found.",
            )
        sessions_snapshot = _snapshot_template_sessions(template)
        instance.shift_template_id = template.id
        instance.status = "SCHEDULED"
        instance.is_rest_day = False
        instance.sessions = sessions_snapshot

    instance.is_adhoc_modified = True
    instance.resolution_mode = "ADHOC_OVERRIDE"
    instance.modified_by_user_id = current_user_id
    instance.modification_reason = payload.reason
    instance.modified_at = now
    instance.updated_at = now

    saved = await save_dated_shift_instance(session, tenant_id, instance)

    # Trigger attendance recalculation for affected employee and calendar date
    try:
        from app.modules.attendance.service import calculate_and_save_daily_attendance
        await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant_id,
            employee_id=saved.employee_id,
            calendar_date=saved.calendar_date,
        )
    except Exception:
        # If no punches exist yet, recalculation gracefully completes or skips
        pass

    return DatedShiftInstanceRead.model_validate(saved)


async def cancel_shift_instance(
    session: AsyncSession,
    tenant_id: UUID,
    instance_id: UUID,
    payload: CancelShiftRequest,
    current_user_id: UUID | None = None,
) -> DatedShiftInstanceRead:
    """N66d / ROS-10 employer cancellation: marks instance CANCELLED_PAID."""
    await set_tenant(session, tenant_id)
    instance = await get_dated_shift_instance_by_id(session, tenant_id, instance_id)
    if instance is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Dated shift instance not found.",
        )

    now = datetime.now(timezone.utc)
    instance.status = "CANCELLED_PAID"
    instance.is_adhoc_modified = True
    instance.modified_by_user_id = current_user_id
    instance.modification_reason = payload.reason
    instance.modified_at = now
    instance.updated_at = now

    saved = await save_dated_shift_instance(session, tenant_id, instance)

    # Trigger attendance recalculation for affected employee and calendar date
    try:
        from app.modules.attendance.service import calculate_and_save_daily_attendance
        await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant_id,
            employee_id=saved.employee_id,
            calendar_date=saved.calendar_date,
        )
    except Exception:
        pass

    return DatedShiftInstanceRead.model_validate(saved)

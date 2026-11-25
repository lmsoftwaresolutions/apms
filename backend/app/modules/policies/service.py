from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.policy import PolicyMaster, PolicyScopeOverride
from app.modules.policies.repository import (
    count_shifts_using_policy,
    delete_override as repo_delete_override,
    delete_policy as repo_delete_policy,
    get_override as repo_get_override,
    get_override_by_scope as repo_get_override_by_scope,
    get_policy as repo_get_policy,
    get_policy_by_code,
    insert_override as repo_insert_override,
    insert_policy,
    list_overrides as repo_list_overrides,
    list_policies as repo_list_policies,
)
from app.modules.policies.schemas import (
    EffectivePolicyConfig,
    PolicyCreate,
    PolicyOverrideCreate,
    PolicyOverrideUpdate,
    PolicyUpdate,
)


async def create_policy(session: AsyncSession, tenant_id: UUID, data: PolicyCreate) -> PolicyMaster:
    existing = await get_policy_by_code(session, tenant_id, data.code)
    if existing is not None:
        raise ProblemError(409, "Policy code already exists", f"Policy with code '{data.code}' already exists.")

    now = datetime.now(UTC)
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=tenant_id,
        code=data.code,
        name=data.name,
        description=data.description,
        is_active=data.is_active,
        late_arrival_allow_minutes=data.late_arrival_allow_minutes,
        early_departure_allow_minutes=data.early_departure_allow_minutes,
        early_arrival_ignore_minutes=data.early_arrival_ignore_minutes,
        late_departure_ignore_minutes=data.late_departure_ignore_minutes,
        half_day_work_duration_minutes=data.half_day_work_duration_minutes,
        full_day_work_duration_minutes=data.full_day_work_duration_minutes,
        half_day_late_cutoff_minutes=data.half_day_late_cutoff_minutes,
        absent_late_cutoff_minutes=data.absent_late_cutoff_minutes,
        ot_minimum_minutes=data.ot_minimum_minutes,
        ot_multiplier=data.ot_multiplier,
        extra_hours_amount=data.extra_hours_amount,
        extra_hours_amount_unit=data.extra_hours_amount_unit,
        max_ot_minutes_per_day=data.max_ot_minutes_per_day,
        in_out_rule=data.in_out_rule,
        allow_wfh=data.allow_wfh,
        wfh_auto_approval_enabled=data.wfh_auto_approval_enabled,
        wfh_monthly_auto_quota=data.wfh_monthly_auto_quota,
        allow_overtime=data.allow_overtime,
        overtime_auto_approval_enabled=data.overtime_auto_approval_enabled,
        allow_wfh_overtime=data.allow_wfh_overtime,
        wfh_ot_requires_approval=data.wfh_ot_requires_approval,
        ot_approval_mode=data.ot_approval_mode,
        ot_auto_approve_threshold_minutes=data.ot_auto_approve_threshold_minutes,
        max_free_lates_per_month=data.max_free_lates_per_month,
        late_penalty_action=data.late_penalty_action,
        late_penalty_leave_type_id=data.late_penalty_leave_type_id,
        created_at=now,
        updated_at=now,
    )
    return await insert_policy(session, policy)


async def list_policies(
    session: AsyncSession,
    tenant_id: UUID,
    is_active: bool | None = None,
) -> list[PolicyMaster]:
    return await repo_list_policies(session, tenant_id, is_active=is_active)


async def get_policy(session: AsyncSession, tenant_id: UUID, policy_id: UUID) -> PolicyMaster:
    policy = await repo_get_policy(session, tenant_id, policy_id)
    if policy is None:
        raise ProblemError(404, "Policy not found", f"Policy with ID '{policy_id}' does not exist.")
    return policy


async def update_policy(
    session: AsyncSession,
    tenant_id: UUID,
    policy_id: UUID,
    data: PolicyUpdate,
) -> PolicyMaster:
    policy = await get_policy(session, tenant_id, policy_id)

    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return policy

    # Threshold cross-validation with existing or updated values
    half_day = updates.get("half_day_work_duration_minutes", policy.half_day_work_duration_minutes)
    full_day = updates.get("full_day_work_duration_minutes", policy.full_day_work_duration_minutes)
    if half_day >= full_day:
        raise ProblemError(
            422,
            "Invalid thresholds",
            "half_day_work_duration_minutes must be strictly less than full_day_work_duration_minutes.",
        )

    half_cutoff = updates.get("half_day_late_cutoff_minutes", policy.half_day_late_cutoff_minutes)
    absent_cutoff = updates.get("absent_late_cutoff_minutes", policy.absent_late_cutoff_minutes)
    if half_cutoff is not None and absent_cutoff is not None and half_cutoff >= absent_cutoff:
        raise ProblemError(
            422,
            "Invalid cutoffs",
            "half_day_late_cutoff_minutes must be strictly less than absent_late_cutoff_minutes.",
        )

    amount = updates.get("extra_hours_amount", policy.extra_hours_amount)
    unit = updates.get("extra_hours_amount_unit", policy.extra_hours_amount_unit)
    if amount is None or amount == 0:
        unit = None
        updates["extra_hours_amount_unit"] = None
    elif unit is None:
        raise ProblemError(
            422,
            "Extra-hours unit required",
            "Set the extra-hours unit (minute, hour, or day) when an amount is entered.",
        )

    for field, val in updates.items():
        setattr(policy, field, val)

    policy.updated_at = datetime.now(UTC)
    await session.flush()
    return policy


async def delete_policy(session: AsyncSession, tenant_id: UUID, policy_id: UUID) -> None:
    policy = await get_policy(session, tenant_id, policy_id)

    usage_count = await count_shifts_using_policy(session, tenant_id, policy_id)
    if usage_count > 0:
        raise ProblemError(
            409,
            "Policy in use",
            f"Policy '{policy.code}' is currently attached to {usage_count} shift template(s) and cannot be deleted.",
        )

    await repo_delete_policy(session, policy)


async def create_override(
    session: AsyncSession, tenant_id: UUID, data: PolicyOverrideCreate
) -> PolicyScopeOverride:
    existing = await repo_get_override_by_scope(session, tenant_id, data.scope_type, data.scope_id)
    if existing is not None:
        raise ProblemError(
            409,
            "Override already exists",
            f"An override for {data.scope_type} with ID '{data.scope_id}' already exists.",
        )

    now = datetime.now(UTC)
    override = PolicyScopeOverride(
        id=uuid4(),
        tenant_id=tenant_id,
        policy_id=data.policy_id,
        scope_type=data.scope_type,
        scope_id=data.scope_id,
        allow_wfh=data.allow_wfh,
        wfh_monthly_quota=data.wfh_monthly_quota,
        wfh_quota_mode=data.wfh_quota_mode,
        allow_overtime=data.allow_overtime,
        ot_approval_mode=data.ot_approval_mode,
        allow_wfh_overtime=data.allow_wfh_overtime,
        wfh_ot_requires_approval=data.wfh_ot_requires_approval,
        is_active=data.is_active,
        created_at=now,
        updated_at=now,
    )
    return await repo_insert_override(session, override)


async def list_overrides(
    session: AsyncSession,
    tenant_id: UUID,
    scope_type: str | None = None,
    scope_id: UUID | None = None,
) -> list[PolicyScopeOverride]:
    return await repo_list_overrides(session, tenant_id, scope_type=scope_type, scope_id=scope_id)


async def get_override(
    session: AsyncSession, tenant_id: UUID, override_id: UUID
) -> PolicyScopeOverride:
    ov = await repo_get_override(session, tenant_id, override_id)
    if ov is None:
        raise ProblemError(404, "Override not found", f"Policy override with ID '{override_id}' does not exist.")
    return ov


async def update_override(
    session: AsyncSession,
    tenant_id: UUID,
    override_id: UUID,
    data: PolicyOverrideUpdate,
) -> PolicyScopeOverride:
    ov = await get_override(session, tenant_id, override_id)
    updates = data.model_dump(exclude_unset=True)
    if not updates:
        return ov

    for field_name, value in updates.items():
        setattr(ov, field_name, value)
    ov.updated_at = datetime.now(UTC)
    await session.flush()
    return ov


async def delete_override(session: AsyncSession, tenant_id: UUID, override_id: UUID) -> None:
    ov = await get_override(session, tenant_id, override_id)
    await repo_delete_override(session, ov)


async def get_effective_config(
    session: AsyncSession, tenant_id: UUID, employee_id: UUID
) -> EffectivePolicyConfig:
    from app.modules.policies.resolver import resolve_effective_policy
    from app.modules.work_modes.service import resolve_employee_policy
    from datetime import date

    today = date.today()
    base_policy = await resolve_employee_policy(session, tenant_id, employee_id, today)
    effective = await resolve_effective_policy(
        session, tenant_id, employee_id, base_policy=base_policy
    )
    return EffectivePolicyConfig(
        employee_id=employee_id,
        effective_allow_wfh=effective.allow_wfh,
        effective_wfh_auto_approval_enabled=effective.wfh_auto_approval_enabled,
        effective_wfh_quota=effective.wfh_monthly_auto_quota,
        effective_allow_overtime=effective.allow_overtime,
        effective_overtime_auto_approval_enabled=effective.overtime_auto_approval_enabled,
        effective_ot_approval_mode=effective.ot_approval_mode,
        effective_allow_wfh_overtime=effective.allow_wfh_overtime,
        effective_wfh_ot_requires_approval=effective.wfh_ot_requires_approval,
        sources=effective.sources,
    )


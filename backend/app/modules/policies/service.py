from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.policy import PolicyMaster
from app.modules.policies.repository import (
    count_shifts_using_policy,
    delete_policy as repo_delete_policy,
    get_policy as repo_get_policy,
    get_policy_by_code,
    insert_policy,
    list_policies as repo_list_policies,
)
from app.modules.policies.schemas import PolicyCreate, PolicyUpdate


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
        max_ot_minutes_per_day=data.max_ot_minutes_per_day,
        in_out_rule=data.in_out_rule,
        wfh_monthly_auto_quota=data.wfh_monthly_auto_quota,
        allow_wfh_overtime=data.allow_wfh_overtime,
        ot_approval_mode=data.ot_approval_mode,
        max_free_lates_per_month=data.max_free_lates_per_month,
        late_penalty_action=data.late_penalty_action,
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

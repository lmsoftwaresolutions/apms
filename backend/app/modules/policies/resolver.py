from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.employee import Employee
from app.models.policy import PolicyMaster, PolicyScopeOverride


@dataclass
class EffectivePolicy:
    employee_id: UUID
    allow_wfh: bool
    wfh_auto_approval_enabled: bool
    wfh_monthly_auto_quota: int | None
    allow_overtime: bool
    overtime_auto_approval_enabled: bool
    ot_approval_mode: str
    allow_wfh_overtime: bool
    wfh_ot_requires_approval: bool
    ot_auto_approve_threshold_minutes: int | None
    base_policy: Any = None
    sources: dict[str, str] = field(default_factory=dict)

    def __getattr__(self, name: str) -> Any:
        if self.base_policy is not None:
            return getattr(self.base_policy, name)
        raise AttributeError(f"EffectivePolicy has no attribute '{name}'")


async def resolve_effective_policy(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    base_policy: PolicyMaster | None = None,
) -> EffectivePolicy:
    """Cascading Policy Resolution Service.

    Priority: Employee > Designation > Department > Base Policy.
    """
    # 1. Fetch employee to get department_id and designation_id
    emp_stmt = select(Employee).where(Employee.tenant_id == tenant_id, Employee.id == employee_id)
    emp_res = await session.execute(emp_stmt)
    employee = emp_res.scalar_one_or_none()

    department_id = employee.department_id if employee else None
    designation_id = employee.designation_id if employee else None

    # 2. Query active overrides
    overrides_stmt = select(PolicyScopeOverride).where(
        PolicyScopeOverride.tenant_id == tenant_id,
        PolicyScopeOverride.is_active.is_(True),
    )
    res = await session.execute(overrides_stmt)
    all_overrides = list(res.scalars().all())

    emp_override: PolicyScopeOverride | None = None
    desig_override: PolicyScopeOverride | None = None
    dept_override: PolicyScopeOverride | None = None

    for ov in all_overrides:
        if ov.scope_type == "EMPLOYEE" and ov.scope_id == employee_id:
            emp_override = ov
        elif designation_id and ov.scope_type == "DESIGNATION" and ov.scope_id == designation_id:
            desig_override = ov
        elif department_id and ov.scope_type == "DEPARTMENT" and ov.scope_id == department_id:
            dept_override = ov

    priority_chain: list[tuple[str, PolicyScopeOverride | None]] = [
        ("EMPLOYEE", emp_override),
        ("DESIGNATION", desig_override),
        ("DEPARTMENT", dept_override),
    ]

    sources: dict[str, str] = {}

    # Base defaults
    base_allow_wfh = getattr(base_policy, "allow_wfh", True) if base_policy else True
    base_wfh_auto = bool(getattr(base_policy, "wfh_auto_approval_enabled", False)) if base_policy else False
    base_wfh_quota = getattr(base_policy, "wfh_monthly_auto_quota", None) if base_policy else None
    base_allow_ot = getattr(base_policy, "allow_overtime", True) if base_policy else True
    base_ot_auto = bool(getattr(base_policy, "overtime_auto_approval_enabled", False)) if base_policy else False
    base_ot_approval_mode = getattr(base_policy, "ot_approval_mode", "ALWAYS_REQUIRE_APPROVAL") if base_policy else "ALWAYS_REQUIRE_APPROVAL"
    base_allow_wfh_ot = getattr(base_policy, "allow_wfh_overtime", False) if base_policy else False
    base_wfh_ot_requires_approval = getattr(base_policy, "wfh_ot_requires_approval", True) if base_policy else True
    base_ot_threshold = getattr(base_policy, "ot_auto_approve_threshold_minutes", None) if base_policy else None

    # A. allow_wfh
    effective_allow_wfh = base_allow_wfh
    sources["allow_wfh"] = "BASE_POLICY"
    for scope_name, ov in priority_chain:
        if ov and ov.allow_wfh is not None:
            effective_allow_wfh = ov.allow_wfh
            sources["allow_wfh"] = scope_name
            break

    # B. wfh_monthly_quota (supports ABSOLUTE and ADDITIVE)
    # Check absolute starting quota: first non-null absolute override or base
    starting_quota = base_wfh_quota
    quota_source = "BASE_POLICY"
    for scope_name, ov in priority_chain:
        if ov and ov.wfh_monthly_quota is not None and ov.wfh_quota_mode == "ABSOLUTE":
            starting_quota = ov.wfh_monthly_quota
            quota_source = scope_name
            break

    # Add any additive overrides
    additive_total = 0
    additive_scopes: list[str] = []
    for scope_name, ov in priority_chain:
        if ov and ov.wfh_monthly_quota is not None and ov.wfh_quota_mode == "ADDITIVE":
            additive_total += ov.wfh_monthly_quota
            additive_scopes.append(f"{scope_name}(+{ov.wfh_monthly_quota})")

    effective_wfh_quota: int | None
    if starting_quota is None and additive_total == 0:
        effective_wfh_quota = None
    else:
        effective_wfh_quota = max(0, (starting_quota or 0) + additive_total)
    if additive_scopes:
        sources["wfh_monthly_quota"] = f"{quota_source} + {', '.join(additive_scopes)}"
    else:
        sources["wfh_monthly_quota"] = quota_source

    # C. allow_overtime
    effective_allow_ot = base_allow_ot
    sources["allow_overtime"] = "BASE_POLICY"
    for scope_name, ov in priority_chain:
        if ov and ov.allow_overtime is not None:
            effective_allow_ot = ov.allow_overtime
            sources["allow_overtime"] = scope_name
            break

    # D. ot_approval_mode
    effective_ot_mode = base_ot_approval_mode
    sources["ot_approval_mode"] = "BASE_POLICY"
    for scope_name, ov in priority_chain:
        if ov and ov.ot_approval_mode is not None:
            effective_ot_mode = ov.ot_approval_mode
            sources["ot_approval_mode"] = scope_name
            break

    # E. allow_wfh_overtime
    effective_allow_wfh_ot = base_allow_wfh_ot
    sources["allow_wfh_overtime"] = "BASE_POLICY"
    for scope_name, ov in priority_chain:
        if ov and ov.allow_wfh_overtime is not None:
            effective_allow_wfh_ot = ov.allow_wfh_overtime
            sources["allow_wfh_overtime"] = scope_name
            break

    # F. wfh_ot_requires_approval
    effective_wfh_ot_req = base_wfh_ot_requires_approval
    sources["wfh_ot_requires_approval"] = "BASE_POLICY"
    for scope_name, ov in priority_chain:
        if ov and ov.wfh_ot_requires_approval is not None:
            effective_wfh_ot_req = ov.wfh_ot_requires_approval
            sources["wfh_ot_requires_approval"] = scope_name
            break

    return EffectivePolicy(
        employee_id=employee_id,
        allow_wfh=effective_allow_wfh,
        wfh_auto_approval_enabled=base_wfh_auto,
        wfh_monthly_auto_quota=effective_wfh_quota,
        allow_overtime=effective_allow_ot,
        overtime_auto_approval_enabled=base_ot_auto,
        ot_approval_mode=effective_ot_mode,
        allow_wfh_overtime=effective_allow_wfh_ot,
        wfh_ot_requires_approval=effective_wfh_ot_req,
        ot_auto_approve_threshold_minutes=base_ot_threshold,
        base_policy=base_policy,
        sources=sources,
    )

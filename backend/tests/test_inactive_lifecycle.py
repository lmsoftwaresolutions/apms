from datetime import UTC, date, datetime, time, timedelta
from decimal import Decimal
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.api.deps import CurrentUser
from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.core.security import hash_password
from app.models.branch import Branch
from app.models.iam import Role, Tenant, User
from app.models.roster import DatedShiftInstance, RosterPattern
from app.models.shift import ShiftTemplate
from app.modules.attendance.cutoff import run_cutoff_rollup
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import create_branch
from app.modules.departments.schemas import DepartmentCreate, DepartmentUpdate
from app.modules.departments.service import create_department, update_department
from app.modules.designations.schemas import DesignationCreate, DesignationUpdate
from app.modules.designations.service import create_designation, update_designation
from app.modules.employees.schemas import EmployeeCreate, EmployeeUpdate
from app.modules.employees.service import create_employee, delete_employee, update_employee
from app.modules.ess.router import _own_employee
from app.modules.iam.service import assign_role
from app.modules.leave.service import (
    create_holiday,
    create_leave_request,
    create_leave_type,
    credit_leave,
)
from app.modules.policies.schemas import PolicyCreate, PolicyOverrideCreate, PolicyOverrideUpdate
from app.modules.policies.service import create_override, create_policy, update_override
from app.modules.regularizations.service import create_request as create_regularization
from app.modules.roster.schemas import (
    AdHocOverrideRequest,
    MaterializeRosterRequest,
    RosterDayMapping,
    RosterPatternCreate,
)
from app.modules.roster.service import create_pattern, materialize_roster, override_shift_instance
from app.modules.shifts.schemas import ShiftSessionCreate, ShiftTemplateCreate, ShiftTemplateUpdate
from app.modules.shifts.service import create_template, update_template
from app.modules.work_modes.schemas import WorkModeApply
from app.modules.work_modes.service import apply_work_mode, resolve_employee_policy


@pytest.fixture
async def tenant_a() -> Tenant:
    async with MigrateSession() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        assert tenant is not None
        return tenant


@pytest.mark.asyncio
async def test_org_hierarchy_blocks_inactive_parents_and_reactivation(tenant_a: Tenant) -> None:
    """Deactivated branches/departments reject child creations, moves, and unsafe reactivations."""
    suffix = uuid4().hex[:6].upper()
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        active_branch = await create_branch(
            session, tenant_a.id, BranchCreate(name=f"Active {suffix}", code=f"ACT{suffix[:4]}")
        )
        inactive_branch = Branch(
            id=uuid4(),
            tenant_id=tenant_a.id,
            name=f"Closed {suffix}",
            code=f"CLS{suffix[:4]}",
            is_active=False,
            created_at=datetime.now(UTC),
        )
        session.add(inactive_branch)
        await session.flush()

        # 1. Cannot create department under inactive branch
        with pytest.raises(ProblemError) as exc:
            await create_department(
                session,
                tenant_a.id,
                DepartmentCreate(branch_id=inactive_branch.id, name="Bad Dept", code=f"BD{suffix}"),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive branch"

        # 2. Create active & inactive parent departments under active branch
        active_parent = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(branch_id=active_branch.id, name="Parent", code=f"PAR{suffix}"),
        )
        inactive_parent = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(branch_id=active_branch.id, name="InactParent", code=f"IP{suffix}"),
        )
        await update_department(session, tenant_a.id, inactive_parent.id, DepartmentUpdate(is_active=False))

        # Cannot create department with inactive parent
        with pytest.raises(ProblemError) as exc:
            await create_department(
                session,
                tenant_a.id,
                DepartmentCreate(
                    branch_id=active_branch.id,
                    name="Child",
                    code=f"CH{suffix}",
                    parent_dept_id=inactive_parent.id,
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive parent department"

        # Cannot move department to inactive branch or re-parent under inactive parent
        with pytest.raises(ProblemError) as exc:
            await update_department(
                session, tenant_a.id, active_parent.id, DepartmentUpdate(branch_id=inactive_branch.id)
            )
        assert exc.value.status == 400

        with pytest.raises(ProblemError) as exc:
            await update_department(
                session, tenant_a.id, active_parent.id, DepartmentUpdate(parent_dept_id=inactive_parent.id)
            )
        assert exc.value.status == 400

        # 3. Designation creation & reactivation blocked under inactive department or branch
        with pytest.raises(ProblemError) as exc:
            await create_designation(
                session,
                tenant_a.id,
                DesignationCreate(department_id=inactive_parent.id, name="Operator", code=f"OP{suffix}"),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive department"

        desig = await create_designation(
            session,
            tenant_a.id,
            DesignationCreate(department_id=active_parent.id, name="Lead", code=f"LD{suffix}"),
        )
        await update_designation(session, tenant_a.id, desig.id, DesignationUpdate(is_active=False))
        await update_department(session, tenant_a.id, active_parent.id, DepartmentUpdate(is_active=False))

        # Cannot reactivate designation while department is deactivated
        with pytest.raises(ProblemError) as exc:
            await update_designation(session, tenant_a.id, desig.id, DesignationUpdate(is_active=True))
        assert exc.value.status == 400
        assert exc.value.title == "Inactive department"

        # Cannot reactivate department while its branch is deactivated
        active_branch_row = await session.get(Branch, active_branch.id)
        assert active_branch_row is not None
        active_branch_row.is_active = False
        await session.flush()

        with pytest.raises(ProblemError) as exc:
            await update_department(session, tenant_a.id, active_parent.id, DepartmentUpdate(is_active=True))
        assert exc.value.status == 400
        assert exc.value.title == "Inactive branch"


@pytest.mark.asyncio
async def test_employee_user_and_iam_inactive_guards(tenant_a: Tenant) -> None:
    """Inactive users cannot be linked/assigned roles; inactive branch blocks employee reactivation."""
    suffix = uuid4().hex[:6].upper()
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        branch = await create_branch(
            session, tenant_a.id, BranchCreate(name=f"EmpB {suffix}", code=f"EB{suffix[:4]}")
        )
        dept = await create_department(
            session, tenant_a.id, DepartmentCreate(branch_id=branch.id, name="Dept", code=f"D{suffix}")
        )
        desig = await create_designation(
            session, tenant_a.id, DesignationCreate(department_id=dept.id, name="Staff", code=f"ST{suffix}")
        )

        inactive_user = User(
            id=uuid4(),
            tenant_id=tenant_a.id,
            email=f"inactive.{suffix.lower()}@northmill.example",
            full_name="Inactive User",
            hashed_password=hash_password("TempPass123!"),
            is_active=False,
            created_at=datetime.now(UTC),
        )
        session.add(inactive_user)
        await session.flush()

        role = await session.scalar(select(Role).where(Role.tenant_id == tenant_a.id))
        assert role is not None

        # Cannot assign role to inactive user
        with pytest.raises(ProblemError) as exc:
            await assign_role(session, tenant_a.id, inactive_user.id, role.id)
        assert exc.value.status == 400
        assert exc.value.title == "Inactive user"

        # Cannot link inactive user on employee creation
        with pytest.raises(ProblemError) as exc:
            await create_employee(
                session,
                tenant_a.id,
                EmployeeCreate(
                    employee_code=f"EL{suffix}",
                    full_name="Linked Fail",
                    branch_id=branch.id,
                    user_id=inactive_user.id,
                    date_of_joining=date(2026, 1, 1),
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive user"

        # Create active employee, then deactivate employee & branch
        emp = await create_employee(
            session,
            tenant_a.id,
            EmployeeCreate(
                employee_code=f"EM{suffix}",
                full_name="Initial Name",
                branch_id=branch.id,
                department_id=dept.id,
                designation_id=desig.id,
                date_of_joining=date(2026, 1, 1),
            ),
        )
        branch_row = await session.get(Branch, branch.id)
        assert branch_row is not None
        branch_row.is_active = False
        await session.flush()

        # Unrelated profile edit still succeeds even though branch was later deactivated
        edited = await update_employee(
            session, tenant_a.id, emp.id, EmployeeUpdate(full_name="Updated Name")
        )
        assert edited.full_name == "Updated Name"

        # Deactivate employee -> cannot reactivate while branch is deactivated
        await delete_employee(session, tenant_a.id, emp.id)
        with pytest.raises(ProblemError) as exc:
            await update_employee(session, tenant_a.id, emp.id, EmployeeUpdate(is_active=True))
        assert exc.value.status == 400
        assert exc.value.title == "Inactive branch"


@pytest.mark.asyncio
async def test_shifts_roster_and_policies_reject_inactive_targets(tenant_a: Tenant) -> None:
    """Shift templates, roster patterns/materializations/overrides, and policy overrides reject inactive refs."""
    suffix = uuid4().hex[:6].upper()
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        branch = await create_branch(
            session, tenant_a.id, BranchCreate(name=f"RosB {suffix}", code=f"RB{suffix[:4]}")
        )
        dept = await create_department(
            session, tenant_a.id, DepartmentCreate(branch_id=branch.id, name="RosDept", code=f"RD{suffix}")
        )
        emp = await create_employee(
            session,
            tenant_a.id,
            EmployeeCreate(
                employee_code=f"ROS{suffix}",
                full_name="Roster Worker",
                branch_id=branch.id,
                department_id=dept.id,
                date_of_joining=date(2026, 1, 1),
            ),
        )

        # Inactive policy rejected when creating shift template
        inactive_pol = await create_policy(
            session,
            tenant_a.id,
            PolicyCreate(code=f"IPOL_{suffix}", name="Inactive Pol", is_active=False),
        )
        with pytest.raises(ProblemError) as exc:
            await create_template(
                session,
                tenant_a.id,
                ShiftTemplateCreate(
                    code=f"SH_{suffix}",
                    name="Shift",
                    policy_id=inactive_pol.id,
                    sessions=[ShiftSessionCreate(session_order=1, start_time=time(9, 0), end_time=time(18, 0))],
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive policy"

        # Active shift & inactive shift
        active_shift = await create_template(
            session,
            tenant_a.id,
            ShiftTemplateCreate(
                code=f"ACT_SH_{suffix}",
                name="Active Shift",
                sessions=[ShiftSessionCreate(session_order=1, start_time=time(9, 0), end_time=time(18, 0))],
            ),
        )
        inactive_shift = await create_template(
            session,
            tenant_a.id,
            ShiftTemplateCreate(
                code=f"INA_SH_{suffix}",
                name="Inactive Shift",
                sessions=[ShiftSessionCreate(session_order=1, start_time=time(9, 0), end_time=time(18, 0))],
            ),
        )
        await update_template(session, tenant_a.id, inactive_shift.id, ShiftTemplateUpdate(is_active=False))

        # Cannot create roster pattern with inactive shift
        with pytest.raises(ProblemError) as exc:
            await create_pattern(
                session,
                tenant_a.id,
                RosterPatternCreate(
                    code=f"PAT_{suffix}",
                    name="Bad Pattern",
                    cycle_length_days=1,
                    cycle_anchor_date=date(2026, 12, 1),
                    day_shift_mapping=[RosterDayMapping(day_index=0, shift_template_id=inactive_shift.id)],
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive shift template"

        # Cannot materialize roster with inactive shift
        with pytest.raises(ProblemError) as exc:
            await materialize_roster(
                session,
                tenant_a.id,
                MaterializeRosterRequest(
                    employee_ids=[emp.id],
                    start_date=date(2026, 12, 1),
                    days=1,
                    shift_template_id=inactive_shift.id,
                ),
            )
        assert exc.value.status == 400

        # Cannot materialize inactive roster pattern
        pattern = await create_pattern(
            session,
            tenant_a.id,
            RosterPatternCreate(
                code=f"GPAT_{suffix}",
                name="Good Pattern",
                cycle_length_days=1,
                cycle_anchor_date=date(2026, 12, 1),
                day_shift_mapping=[RosterDayMapping(day_index=0, shift_template_id=active_shift.id)],
            ),
        )
        pat_row = await session.get(RosterPattern, pattern.id)
        assert pat_row is not None
        pat_row.is_active = False
        await session.flush()

        with pytest.raises(ProblemError) as exc:
            await materialize_roster(
                session,
                tenant_a.id,
                MaterializeRosterRequest(
                    employee_ids=[emp.id],
                    start_date=date(2026, 12, 1),
                    days=1,
                    roster_pattern_id=pattern.id,
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive roster pattern"

        # Materialize with active shift, then fail ad-hoc override onto inactive shift
        await materialize_roster(
            session,
            tenant_a.id,
            MaterializeRosterRequest(
                employee_ids=[emp.id],
                start_date=date(2026, 12, 1),
                days=1,
                shift_template_id=active_shift.id,
            ),
        )
        inst = await session.scalar(
            select(DatedShiftInstance).where(
                DatedShiftInstance.tenant_id == tenant_a.id,
                DatedShiftInstance.employee_id == emp.id,
            )
        )
        assert inst is not None

        with pytest.raises(ProblemError) as exc:
            await override_shift_instance(
                session,
                tenant_a.id,
                inst.id,
                AdHocOverrideRequest(shift_template_id=inactive_shift.id, is_rest_day=False, reason="Test override"),
            )
        assert exc.value.status == 400

        # Policy override rejects nonexistent or deactivated scopes/policies
        with pytest.raises(ProblemError) as exc:
            await create_override(
                session,
                tenant_a.id,
                PolicyOverrideCreate(scope_type="EMPLOYEE", scope_id=uuid4(), allow_wfh=False),
            )
        assert exc.value.status == 404

        with pytest.raises(ProblemError) as exc:
            await create_override(
                session,
                tenant_a.id,
                PolicyOverrideCreate(
                    policy_id=inactive_pol.id,
                    scope_type="DEPARTMENT",
                    scope_id=dept.id,
                    allow_wfh=False,
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive policy"

        await update_department(session, tenant_a.id, dept.id, DepartmentUpdate(is_active=False))
        with pytest.raises(ProblemError) as exc:
            await create_override(
                session,
                tenant_a.id,
                PolicyOverrideCreate(scope_type="DEPARTMENT", scope_id=dept.id, allow_wfh=False),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive department"

        # resolve_employee_policy skips inactive shift-linked policy and falls back
        inst.shift_template_id = active_shift.id
        tpl_model = await session.get(ShiftTemplate, active_shift.id)
        assert tpl_model is not None
        tpl_model.policy_id = inactive_pol.id
        await session.flush()

        resolved = await resolve_employee_policy(session, tenant_a.id, emp.id, date(2026, 12, 1))
        assert resolved is None or resolved.id != inactive_pol.id


@pytest.mark.asyncio
async def test_leave_regularization_work_mode_ess_and_cutoff_block_inactive(tenant_a: Tenant) -> None:
    """Offboarded employees and closed branches are blocked across leave, regularization, work-mode, ESS, and cutoff."""
    suffix = uuid4().hex[:6].upper()
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        branch = await create_branch(
            session, tenant_a.id, BranchCreate(name=f"WfB {suffix}", code=f"WB{suffix[:4]}")
        )
        user = User(
            id=uuid4(),
            tenant_id=tenant_a.id,
            email=f"offboarded.{suffix.lower()}@northmill.example",
            full_name="Offboarded Worker",
            hashed_password=hash_password("TempPass123!"),
            is_active=True,
            created_at=datetime.now(UTC),
        )
        session.add(user)
        await session.flush()

        emp = await create_employee(
            session,
            tenant_a.id,
            EmployeeCreate(
                employee_code=f"OFF{suffix}",
                full_name="Offboarded Worker",
                branch_id=branch.id,
                user_id=user.id,
                date_of_joining=date(2026, 1, 1),
            ),
        )
        lt = await create_leave_type(session, tenant_a.id, f"CL{suffix[:4]}", "Casual", False, False)

        # Materialize an instance in past lookback window before offboarding to test cutoff skip
        past_date = datetime.now(UTC).date() - timedelta(days=1)
        shift = await create_template(
            session,
            tenant_a.id,
            ShiftTemplateCreate(
                code=f"CUT_{suffix}",
                name="Cutoff Shift",
                sessions=[ShiftSessionCreate(session_order=1, start_time=time(9, 0), end_time=time(18, 0))],
            ),
        )
        await materialize_roster(
            session,
            tenant_a.id,
            MaterializeRosterRequest(
                employee_ids=[emp.id],
                start_date=past_date,
                days=1,
                shift_template_id=shift.id,
            ),
        )

        # Now offboard employee and deactivate branch
        await delete_employee(session, tenant_a.id, emp.id)
        branch_row = await session.get(Branch, branch.id)
        assert branch_row is not None
        branch_row.is_active = False
        await session.flush()

        # 1. Holiday blocked on inactive branch
        with pytest.raises(ProblemError) as exc:
            await create_holiday(session, tenant_a.id, branch.id, date(2026, 12, 25), "Christmas")
        assert exc.value.status == 400
        assert exc.value.title == "Inactive branch"

        # 2. Leave request & credit blocked for inactive employee
        with pytest.raises(ProblemError) as exc:
            await create_leave_request(
                session, tenant_a.id, emp.id, lt.id, date(2026, 12, 5), date(2026, 12, 5), "FULL", "Sick"
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive employee"

        with pytest.raises(ProblemError) as exc:
            await credit_leave(
                session, tenant_a.id, emp.id, lt.id, Decimal("1.0"), date(2026, 12, 1), "CREDIT"
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive employee"

        # 3. Work mode blocked for inactive employee
        with pytest.raises(ProblemError) as exc:
            await apply_work_mode(
                session,
                tenant_a.id,
                emp.id,
                WorkModeApply(
                    work_mode="ON_DUTY",
                    calendar_date=date(2026, 12, 6),
                    session_target="FULL",
                    reason="Client visit",
                ),
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive employee"

        # 4. Regularization blocked for inactive employee
        with pytest.raises(ProblemError) as exc:
            await create_regularization(
                session,
                tenant_a.id,
                emp.id,
                date(2026, 12, 2),
                "MISSED_IN",
                datetime(2026, 12, 2, 9, 0, tzinfo=UTC),
                None,
                "Forgot punch",
            )
        assert exc.value.status == 400
        assert exc.value.title == "Inactive employee"

        # 5. ESS write guard rejects inactive employee profile
        current = CurrentUser(user, {"work_mode.request.create"})
        with pytest.raises(ProblemError) as exc:
            await _own_employee(session, current, require_active=True)
        assert exc.value.status == 403
        assert exc.value.title == "Inactive employee"

        # 6. Cutoff rollup skips inactive employee instances cleanly
        await run_cutoff_rollup(session, tenant_a.id, datetime.now(UTC) + timedelta(days=2))
        from app.modules.attendance.repository import find_attendance_record

        att_rec = await find_attendance_record(session, tenant_a.id, emp.id, past_date)
        assert att_rec is None

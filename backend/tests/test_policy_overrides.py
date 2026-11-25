from datetime import UTC, date, datetime
from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.main import app
from app.models.branch import Branch
from app.models.department import Department
from app.models.designation import Designation
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.policy import PolicyMaster, PolicyScopeOverride
from app.modules.policies.resolver import resolve_effective_policy
from app.modules.policies.schemas import PolicyCreate, PolicyOverrideCreate, PolicyOverrideUpdate
from app.modules.policies.service import (
    create_override,
    create_policy,
    delete_override,
    get_override,
    list_overrides,
    update_override,
)
from app.modules.work_modes.schemas import WorkModeApply
from app.modules.work_modes.service import apply_work_mode


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


async def _create_org_structure(session, tenant_id: uuid4) -> tuple[Branch, Department, Designation, Employee]:
    branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_id))
    assert branch is not None

    dept = Department(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch.id,
        code=f"ENG_{uuid4().hex[:6].upper()}",
        name="Engineering",
        created_at=datetime.now(UTC),
    )
    session.add(dept)
    await session.flush()

    desig = Designation(
        id=uuid4(),
        tenant_id=tenant_id,
        department_id=dept.id,
        code=f"DEV_{uuid4().hex[:6].upper()}",
        name="Senior Developer",
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(desig)
    await session.flush()

    emp = Employee(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch.id,
        department_id=dept.id,
        designation_id=desig.id,
        employee_code=f"EMP_{uuid4().hex[:6].upper()}",
        full_name="Override Test Employee",
        date_of_joining=date(2026, 1, 1),
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(emp)
    await session.flush()

    return branch, dept, desig, emp


@pytest.mark.asyncio
async def test_cascading_override_resolution(seeded_tenants: tuple[Tenant, Tenant]):
    """Cascading Policy Resolution: Employee > Designation > Department > Base Policy."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        _, dept, desig, emp = await _create_org_structure(session, tenant.id)

        # Base Policy: allow_wfh=True, quota=4, allow_ot=True, ot_mode='ALWAYS_REQUIRE_APPROVAL'
        base_pol = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"BASE_{uuid4().hex[:6].upper()}",
                name="Base Factory Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                allow_wfh=True,
                wfh_monthly_auto_quota=4,
                allow_overtime=True,
                ot_approval_mode="ALWAYS_REQUIRE_APPROVAL",
            ),
        )

        # 1. Level 0: No overrides -> All resolved from Base Policy
        eff_0 = await resolve_effective_policy(session, tenant.id, emp.id, base_policy=base_pol)
        assert eff_0.allow_wfh is True
        assert eff_0.wfh_monthly_auto_quota == 4
        assert eff_0.ot_approval_mode == "ALWAYS_REQUIRE_APPROVAL"
        assert eff_0.sources["allow_wfh"] == "BASE_POLICY"

        # 2. Level 1: Department Override sets allow_wfh=False, ot_mode='AUTO_APPROVE_ALL'
        await create_override(
            session,
            tenant.id,
            PolicyOverrideCreate(
                scope_type="DEPARTMENT",
                scope_id=dept.id,
                allow_wfh=False,
                ot_approval_mode="AUTO_APPROVE_ALL",
            ),
        )
        eff_1 = await resolve_effective_policy(session, tenant.id, emp.id, base_policy=base_pol)
        assert eff_1.allow_wfh is False
        assert eff_1.ot_approval_mode == "AUTO_APPROVE_ALL"
        assert eff_1.sources["allow_wfh"] == "DEPARTMENT"

        # 3. Level 2: Designation Override overrides allow_wfh back to True, sets ot_mode='AUTO_APPROVE_BELOW_THRESHOLD'
        await create_override(
            session,
            tenant.id,
            PolicyOverrideCreate(
                scope_type="DESIGNATION",
                scope_id=desig.id,
                allow_wfh=True,
                ot_approval_mode="AUTO_APPROVE_BELOW_THRESHOLD",
            ),
        )
        eff_2 = await resolve_effective_policy(session, tenant.id, emp.id, base_policy=base_pol)
        assert eff_2.allow_wfh is True
        assert eff_2.ot_approval_mode == "AUTO_APPROVE_BELOW_THRESHOLD"
        assert eff_2.sources["allow_wfh"] == "DESIGNATION"

        # 4. Level 3: Employee Override sets allow_wfh=False, ot_mode='DISABLED'
        await create_override(
            session,
            tenant.id,
            PolicyOverrideCreate(
                scope_type="EMPLOYEE",
                scope_id=emp.id,
                allow_wfh=False,
                ot_approval_mode="DISABLED",
            ),
        )
        eff_3 = await resolve_effective_policy(session, tenant.id, emp.id, base_policy=base_pol)
        assert eff_3.allow_wfh is False
        assert eff_3.ot_approval_mode == "DISABLED"
        assert eff_3.sources["allow_wfh"] == "EMPLOYEE"


@pytest.mark.asyncio
async def test_wfh_department_disabled_blocks_application(seeded_tenants: tuple[Tenant, Tenant]):
    """Turning WFH OFF for a department blocks WFH application with 422."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        _, dept, _, emp = await _create_org_structure(session, tenant.id)

        # Department override sets allow_wfh = False
        await create_override(
            session,
            tenant.id,
            PolicyOverrideCreate(
                scope_type="DEPARTMENT",
                scope_id=dept.id,
                allow_wfh=False,
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        # Applying for WFH must be rejected with 422
        with pytest.raises(ProblemError) as exc_info:
            await apply_work_mode(
                session,
                tenant.id,
                emp.id,
                WorkModeApply(
                    work_mode="WFH",
                    calendar_date=date(2026, 11, 20),
                    session_target="FULL",
                    reason="Home study request",
                ),
            )
        assert exc_info.value.status == 422
        assert "Work From Home is disabled" in exc_info.value.detail


@pytest.mark.asyncio
async def test_wfh_additive_quota_increases_allowance(seeded_tenants: tuple[Tenant, Tenant]):
    """An additive override stacks on the quota the admin set on the base policy."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        _, _, _, emp = await _create_org_structure(session, tenant.id)
        base_pol = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"ADD_{uuid4().hex[:6].upper()}",
                name="Quota Four",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                wfh_monthly_auto_quota=4,
            ),
        )

        # Employee override: ADDITIVE +4 WFH days (configured base 4 -> effective 8)
        await create_override(
            session,
            tenant.id,
            PolicyOverrideCreate(
                scope_type="EMPLOYEE",
                scope_id=emp.id,
                wfh_monthly_quota=4,
                wfh_quota_mode="ADDITIVE",
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        eff = await resolve_effective_policy(session, tenant.id, emp.id, base_policy=base_pol)
        assert eff.wfh_monthly_auto_quota == 8
        assert "EMPLOYEE(+4)" in eff.sources["wfh_monthly_quota"]


@pytest.mark.asyncio
async def test_policy_override_crud_and_effective_config_api():
    """Verify REST API endpoints for Policy Scope Overrides and Effective Configuration preview."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Admin login
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 1. Create Department for testing override
        dept_code = f"API_D_{uuid4().hex[:6].upper()}"
        async with MigrateSession() as mig:
            tenant = await mig.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
            branch = await mig.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
            dept = Department(
                id=uuid4(),
                tenant_id=tenant.id,
                branch_id=branch.id,
                code=dept_code,
                name="API Override Dept",
                created_at=datetime.now(UTC),
            )
            mig.add(dept)
            emp = Employee(
                id=uuid4(),
                tenant_id=tenant.id,
                branch_id=branch.id,
                department_id=dept.id,
                employee_code=f"API_E_{uuid4().hex[:6].upper()}",
                full_name="API Override Employee",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            mig.add(emp)
            await mig.commit()
            dept_id = dept.id
            emp_id = emp.id

        # 2. Create Override via POST /api/v1/policies/overrides
        create_resp = await client.post(
            "/api/v1/policies/overrides",
            headers=headers,
            json={
                "scope_type": "DEPARTMENT",
                "scope_id": str(dept_id),
                "allow_wfh": False,
                "allow_overtime": True,
                "ot_approval_mode": "AUTO_APPROVE_ALL",
            },
        )
        assert create_resp.status_code == 201
        ov_data = create_resp.json()
        assert ov_data["allow_wfh"] is False
        assert ov_data["ot_approval_mode"] == "AUTO_APPROVE_ALL"
        override_id = ov_data["id"]

        # 3. List Overrides via GET /api/v1/policies/overrides
        list_resp = await client.get("/api/v1/policies/overrides", headers=headers)
        assert list_resp.status_code == 200
        assert any(o["id"] == override_id for o in list_resp.json())

        # 4. Preview Effective Config via GET /api/v1/policies/effective-config
        preview_resp = await client.get(
            f"/api/v1/policies/effective-config?employee_id={emp_id}", headers=headers
        )
        assert preview_resp.status_code == 200
        preview_data = preview_resp.json()
        assert preview_data["effective_allow_wfh"] is False
        assert preview_data["effective_ot_approval_mode"] == "AUTO_APPROVE_ALL"
        assert preview_data["sources"]["allow_wfh"] == "DEPARTMENT"

        # 5. Update Override via PUT /api/v1/policies/overrides/{id}
        update_resp = await client.put(
            f"/api/v1/policies/overrides/{override_id}",
            headers=headers,
            json={"allow_wfh": True, "wfh_monthly_quota": 6},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["allow_wfh"] is True
        assert update_resp.json()["wfh_monthly_quota"] == 6

        # 6. Delete Override via DELETE /api/v1/policies/overrides/{id}
        del_resp = await client.delete(f"/api/v1/policies/overrides/{override_id}", headers=headers)
        assert del_resp.status_code == 204


@pytest.mark.asyncio
async def test_policy_override_rls_isolation(seeded_tenants: tuple[Tenant, Tenant]):
    """Tenant A overrides must not be visible or accessible to Tenant B."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        _, dept_a, _, _ = await _create_org_structure(session, tenant_a.id)

        ov_a = await create_override(
            session,
            tenant_a.id,
            PolicyOverrideCreate(
                scope_type="DEPARTMENT",
                scope_id=dept_a.id,
                allow_wfh=False,
            ),
        )
        await session.commit()
        ov_id = ov_a.id

    # In Tenant B session, get_override must raise 404
    async with SessionLocal() as session:
        await set_tenant(session, tenant_b.id)
        with pytest.raises(ProblemError) as exc_info:
            await get_override(session, tenant_b.id, ov_id)
        assert exc_info.value.status == 404

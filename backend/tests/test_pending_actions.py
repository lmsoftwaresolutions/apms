from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.main import app
from app.models.branch import Branch
from app.models.department import Department
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.pending_action import PendingAction


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_probation_scanner_and_resolution_flow(seeded_tenants: tuple[Tenant, Tenant]):
    tenant_a, _ = seeded_tenants
    today = date.today()
    probation_end = today + timedelta(days=5)

    # 1. Login as North Mill Admin
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={
                "email": "admin@northmill.example",
                "password": "ChangeMe-Admin-1",
            },
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Create a probation employee in Tenant A
        async with MigrateSession() as mig:
            branch = await mig.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            assert branch is not None
            emp = Employee(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=f"PRB_{uuid4().hex[:6].upper()}",
                full_name="Probation Test Worker",
                employment_type="PROBATION",
                date_of_joining=today - timedelta(days=40),
                probation_end_date=probation_end,
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            mig.add(emp)
            await mig.commit()
            emp_id = emp.id

        try:
            # 3. Check count API - should automatically scan and detect 1 pending action
            count_resp = await client.get("/api/v1/pending-actions/count", headers=headers)
            assert count_resp.status_code == 200
            counts = count_resp.json()
            assert counts["pending"] >= 1
            assert counts["due_soon"] >= 1

            # 4. List pending actions
            list_resp = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers)
            assert list_resp.status_code == 200
            actions = list_resp.json()
            emp_action = next((a for a in actions if a["subject_id"] == str(emp_id)), None)
            assert emp_action is not None
            assert emp_action["action_type"] == "PROBATION_EXPIRY"
            assert emp_action["status"] == "PENDING"
            action_id = emp_action["id"]

            # 5. Confirm employee into permanent role
            resolve_resp = await client.post(
                f"/api/v1/pending-actions/{action_id}/resolve",
                headers=headers,
                json={
                    "action": "CONFIRM",
                    "note": "Excellent performance during probation period.",
                    "target_employment_type": "FULL_TIME",
                },
            )
            assert resolve_resp.status_code == 200
            resolved_data = resolve_resp.json()
            assert resolved_data["status"] == "RESOLVED"

            # 6. Verify employee was updated to FULL_TIME with confirmation_date
            async with SessionLocal() as session:
                await set_tenant(session, tenant_a.id)
                updated_emp = await session.get(Employee, emp_id)
                assert updated_emp is not None
                assert updated_emp.employment_type == "FULL_TIME"
                assert updated_emp.confirmation_date == today
        finally:
            # Cleanup test employee and action to preserve dev DB hygiene
            async with MigrateSession() as mig:
                act = await mig.scalar(select(PendingAction).where(PendingAction.subject_id == emp_id))
                if act:
                    await mig.delete(act)
                e = await mig.get(Employee, emp_id)
                if e:
                    await mig.delete(e)
                await mig.commit()


@pytest.mark.asyncio
async def test_pending_actions_rls_isolation(seeded_tenants: tuple[Tenant, Tenant]):
    tenant_a, tenant_b = seeded_tenants
    today = date.today()
    probation_end = today + timedelta(days=3)

    # 1. Create a probation employee in Tenant A
    async with MigrateSession() as mig:
        branch = await mig.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None
        emp = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch.id,
            employee_code=f"PRB_{uuid4().hex[:6].upper()}",
            full_name="RLS Isolation Test Worker",
            employment_type="PROBATION",
            date_of_joining=today - timedelta(days=20),
            probation_end_date=probation_end,
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        mig.add(emp)
        await mig.commit()
        emp_id = emp.id

    try:
        # Trigger scan as Tenant A
        transport = ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            login_a = await client.post(
                "/api/v1/auth/login",
                json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
            )
            token_a = login_a.json()["access_token"]
            headers_a = {"Authorization": f"Bearer {token_a}"}

            list_a = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers_a)
            assert list_a.status_code == 200
            act_a = next((a for a in list_a.json() if a["subject_id"] == str(emp_id)), None)
            assert act_a is not None
            action_id = act_a["id"]

            # Now login as South Mill Admin (Tenant B)
            login_b = await client.post(
                "/api/v1/auth/login",
                json={"email": "admin@southmill.example", "password": "ChangeMe-Admin-1"},
            )
            token_b = login_b.json()["access_token"]
            headers_b = {"Authorization": f"Bearer {token_b}"}

            # Tenant B list must NOT contain Tenant A's pending action
            list_b = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers_b)
            assert list_b.status_code == 200
            assert all(a["id"] != action_id for a in list_b.json())
            assert all(a["subject_id"] != str(emp_id) for a in list_b.json())

            # Tenant B attempting to resolve Tenant A's action must fail with 404
            resolve_b = await client.post(
                f"/api/v1/pending-actions/{action_id}/resolve",
                headers=headers_b,
                json={"action": "CONFIRM"},
            )
            assert resolve_b.status_code == 404
    finally:
        async with MigrateSession() as mig:
            act = await mig.scalar(select(PendingAction).where(PendingAction.subject_id == emp_id))
            if act:
                await mig.delete(act)
            e = await mig.get(Employee, emp_id)
            if e:
                await mig.delete(e)
            await mig.commit()


@pytest.mark.asyncio
async def test_probation_extend_flow(seeded_tenants: tuple[Tenant, Tenant]):
    tenant_a, _ = seeded_tenants
    today = date.today()
    probation_end = today + timedelta(days=2)
    new_probation_end = today + timedelta(days=44)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        async with MigrateSession() as mig:
            branch = await mig.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            assert branch is not None
            emp = Employee(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=f"PRB_{uuid4().hex[:6].upper()}",
                full_name="Extension Test Worker",
                employment_type="PROBATION",
                date_of_joining=today - timedelta(days=30),
                probation_end_date=probation_end,
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            mig.add(emp)
            await mig.commit()
            emp_id = emp.id

        try:
            # List to trigger scan
            list_resp = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers)
            assert list_resp.status_code == 200
            emp_action = next((a for a in list_resp.json() if a["subject_id"] == str(emp_id)), None)
            assert emp_action is not None
            action_id = emp_action["id"]

            # Extend probation by 44 days
            resolve_resp = await client.post(
                f"/api/v1/pending-actions/{action_id}/resolve",
                headers=headers,
                json={
                    "action": "EXTEND",
                    "note": "Extended probation by 44 days for additional training.",
                    "new_end_date": new_probation_end.isoformat(),
                },
            )
            assert resolve_resp.status_code == 200
            assert resolve_resp.json()["status"] == "RESOLVED"

            # Verify employee's probation_end_date was updated
            async with SessionLocal() as session:
                await set_tenant(session, tenant_a.id)
                updated_emp = await session.get(Employee, emp_id)
                assert updated_emp is not None
                assert updated_emp.probation_end_date == new_probation_end
                assert updated_emp.employment_type == "PROBATION"
        finally:
            async with MigrateSession() as mig:
                act = await mig.scalar(select(PendingAction).where(PendingAction.subject_id == emp_id))
                if act:
                    await mig.delete(act)
                e = await mig.get(Employee, emp_id)
                if e:
                    await mig.delete(e)
                await mig.commit()


@pytest.mark.asyncio
async def test_dismissed_probation_warning_is_not_recreated(seeded_tenants: tuple[Tenant, Tenant]):
    tenant_a, _ = seeded_tenants
    today = date.today()
    probation_end = today + timedelta(days=4)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        async with MigrateSession() as mig:
            branch = await mig.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            assert branch is not None
            emp = Employee(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=f"PRB_{uuid4().hex[:6].upper()}",
                full_name="Dismissed Probation Worker",
                employment_type="PROBATION",
                date_of_joining=today - timedelta(days=20),
                probation_end_date=probation_end,
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            mig.add(emp)
            await mig.commit()
            emp_id = emp.id

        try:
            listed = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers)
            assert listed.status_code == 200
            action = next(item for item in listed.json() if item["subject_id"] == str(emp_id))

            dismissed = await client.post(
                f"/api/v1/pending-actions/{action['id']}/resolve",
                headers=headers,
                json={"action": "DISMISS", "note": "Reviewed offline."},
            )
            assert dismissed.status_code == 200
            assert dismissed.json()["status"] == "DISMISSED"

            again = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers)
            assert again.status_code == 200
            assert all(item["subject_id"] != str(emp_id) for item in again.json())
        finally:
            async with MigrateSession() as mig:
                for act in (await mig.scalars(select(PendingAction).where(PendingAction.subject_id == emp_id))).all():
                    await mig.delete(act)
                employee = await mig.get(Employee, emp_id)
                if employee is not None:
                    await mig.delete(employee)
                await mig.commit()


@pytest.mark.asyncio
async def test_confirm_rejects_inactive_department(seeded_tenants: tuple[Tenant, Tenant]):
    tenant_a, _ = seeded_tenants
    today = date.today()
    probation_end = today + timedelta(days=4)

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        async with MigrateSession() as mig:
            branch = await mig.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            assert branch is not None
            dept = Department(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                name="Closed Desk",
                code=f"CL{uuid4().hex[:4].upper()}",
                is_active=False,
                created_at=datetime.now(UTC),
            )
            emp = Employee(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=f"PRB_{uuid4().hex[:6].upper()}",
                full_name="Confirm Guard Worker",
                employment_type="PROBATION",
                date_of_joining=today - timedelta(days=20),
                probation_end_date=probation_end,
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
            mig.add(dept)
            mig.add(emp)
            await mig.commit()
            dept_id = dept.id
            emp_id = emp.id

        try:
            listed = await client.get("/api/v1/pending-actions?status=PENDING", headers=headers)
            assert listed.status_code == 200
            action = next(item for item in listed.json() if item["subject_id"] == str(emp_id))
            rejected = await client.post(
                f"/api/v1/pending-actions/{action['id']}/resolve",
                headers=headers,
                json={"action": "CONFIRM", "target_department_id": str(dept_id)},
            )
            assert rejected.status_code == 400
            assert rejected.json()["title"] == "Inactive department"

            async with SessionLocal() as session:
                await set_tenant(session, tenant_a.id)
                employee = await session.get(Employee, emp_id)
                assert employee is not None
                assert employee.employment_type == "PROBATION"
        finally:
            async with MigrateSession() as mig:
                for act in (await mig.scalars(select(PendingAction).where(PendingAction.subject_id == emp_id))).all():
                    await mig.delete(act)
                employee = await mig.get(Employee, emp_id)
                if employee is not None:
                    await mig.delete(employee)
                department = await mig.get(Department, dept_id)
                if department is not None:
                    await mig.delete(department)
                await mig.commit()

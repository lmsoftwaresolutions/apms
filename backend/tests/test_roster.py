from datetime import UTC, date, datetime
from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.main import app
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.roster import DatedShiftInstance
from app.modules.attendance.service import calculate_and_save_daily_attendance


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_roster_pattern_creation_and_listing() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # 1. Create a shift template first
        shift_resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "code": f"SHF_{uuid4().hex[:6].upper()}",
                "name": "Standard Day Shift",
                "sessions": [
                    {"session_order": 1, "start_time": "09:00:00", "end_time": "18:00:00"}
                ],
            },
        )
        assert shift_resp.status_code == 201
        template_id = shift_resp.json()["id"]

        # 2. Create 7-day weekly rotation pattern
        pat_code = f"PAT_{uuid4().hex[:6].upper()}"
        pat_payload = {
            "code": pat_code,
            "name": "Standard Mon-Sat Pattern",
            "cycle_length_days": 7,
            "day_shift_mapping": [
                {"day_index": i, "shift_template_id": template_id, "is_rest_day": False}
                for i in range(6)
            ]
            + [{"day_index": 6, "shift_template_id": None, "is_rest_day": True}],
        }

        resp = await client.post("/api/v1/roster/patterns", headers=headers, json=pat_payload)
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["code"] == pat_code
        assert data["cycle_length_days"] == 7
        assert len(data["day_shift_mapping"]) == 7
        pattern_id = data["id"]

        # 3. Get pattern by ID
        get_resp = await client.get(f"/api/v1/roster/patterns/{pattern_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == pattern_id

        # 4. List patterns
        list_resp = await client.get("/api/v1/roster/patterns", headers=headers)
        assert list_resp.status_code == 200
        assert any(p["id"] == pattern_id for p in list_resp.json())


@pytest.mark.asyncio
async def test_forward_materialization_30_days(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant_a, _ = seeded_tenants
    transport = ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # 1. Create employee in Tenant A
        async with SessionLocal() as session:
            await set_tenant(session, tenant_a.id)
            branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            assert branch is not None
            emp_id = uuid4()
            session.add(
                Employee(
                    id=emp_id,
                    tenant_id=tenant_a.id,
                    branch_id=branch.id,
                    employee_code=f"ROS_{uuid4().hex[:6].upper()}",
                    full_name="Roster Employee",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )
            await session.commit()

        # 2. Create template
        shift_resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "code": f"MAT_{uuid4().hex[:6].upper()}",
                "name": "Materialize Template",
                "sessions": [
                    {"session_order": 1, "start_time": "08:30:00", "end_time": "17:30:00"}
                ],
            },
        )
        template_id = shift_resp.json()["id"]

        # 3. Materialize 30 days forward (ADR-15)
        start_date = date(2026, 12, 1)
        mat_resp = await client.post(
            "/api/v1/roster/materialize",
            headers=headers,
            json={
                "employee_ids": [str(emp_id)],
                "start_date": "2026-12-01",
                "days": 30,
                "shift_template_id": template_id,
            },
        )
        assert mat_resp.status_code == 201, mat_resp.text
        assert mat_resp.json()["total_materialized"] == 30

        # 4. Query instances
        inst_resp = await client.get(
            f"/api/v1/roster/instances?employee_id={emp_id}&start_date=2026-12-01&end_date=2026-12-30",
            headers=headers,
        )
        assert inst_resp.status_code == 200
        instances = inst_resp.json()
        assert len(instances) == 30

        # Verify session snapshot in materialized row
        first_inst = instances[0]
        assert first_inst["calendar_date"] == "2026-12-01"
        assert first_inst["status"] == "SCHEDULED"
        assert len(first_inst["sessions"]) == 1
        assert first_inst["sessions"][0]["start_time"] == "08:30:00"
        assert first_inst["sessions"][0]["end_time"] == "17:30:00"


@pytest.mark.asyncio
async def test_n67_supervisor_ad_hoc_override(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant_a, _ = seeded_tenants
    transport = ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Setup employee
        async with SessionLocal() as session:
            await set_tenant(session, tenant_a.id)
            branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            emp_id = uuid4()
            session.add(
                Employee(
                    id=emp_id,
                    tenant_id=tenant_a.id,
                    branch_id=branch.id,
                    employee_code=f"N67_{uuid4().hex[:6].upper()}",
                    full_name="Override Employee",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )
            await session.commit()

        # Shift A & Shift B
        s_a = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "code": f"SA_{uuid4().hex[:6].upper()}",
                "name": "Shift A Regular",
                "sessions": [
                    {"session_order": 1, "start_time": "09:00:00", "end_time": "18:00:00"}
                ],
            },
        )
        s_b = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "code": f"SB_{uuid4().hex[:6].upper()}",
                "name": "Shift B Emergency",
                "sessions": [
                    {"session_order": 1, "start_time": "14:00:00", "end_time": "22:00:00"}
                ],
            },
        )
        tid_a = s_a.json()["id"]
        tid_b = s_b.json()["id"]

        # Materialize 5 days with Shift A
        await client.post(
            "/api/v1/roster/materialize",
            headers=headers,
            json={
                "employee_ids": [str(emp_id)],
                "start_date": "2026-12-10",
                "days": 5,
                "shift_template_id": tid_a,
            },
        )

        # Get instance for 2026-12-12
        list_resp = await client.get(
            f"/api/v1/roster/instances?employee_id={emp_id}&start_date=2026-12-12&end_date=2026-12-12",
            headers=headers,
        )
        inst_12 = list_resp.json()[0]
        inst_id = inst_12["id"]
        assert inst_12["is_adhoc_modified"] is False
        assert inst_12["shift_template_id"] == tid_a

        # 1. Perform N67 Supervisor Ad-Hoc Override
        override_resp = await client.put(
            f"/api/v1/roster/instances/{inst_id}/override",
            headers=headers,
            json={
                "shift_template_id": tid_b,
                "is_rest_day": False,
                "reason": "Emergency night coverage for client site",
            },
        )
        assert override_resp.status_code == 200, override_resp.text
        overridden = override_resp.json()
        assert overridden["is_adhoc_modified"] is True
        assert overridden["resolution_mode"] == "ADHOC_OVERRIDE"
        assert overridden["shift_template_id"] == tid_b
        assert overridden["modification_reason"] == "Emergency night coverage for client site"
        assert overridden["sessions"][0]["start_time"] == "14:00:00"

        # 2. Invariant Check: Master recurring templates A and B remain UNCHANGED!
        get_sa = await client.get(f"/api/v1/shifts/templates/{tid_a}", headers=headers)
        assert get_sa.json()["sessions"][0]["start_time"] == "09:00:00"

        # 3. Invariant Check: Re-running materialization DOES NOT overwrite ad-hoc override
        mat_again = await client.post(
            "/api/v1/roster/materialize",
            headers=headers,
            json={
                "employee_ids": [str(emp_id)],
                "start_date": "2026-12-10",
                "days": 5,
                "shift_template_id": tid_a,
            },
        )
        assert mat_again.status_code == 201

        check_again = await client.get(f"/api/v1/roster/instances/{inst_id}", headers=headers)
        assert check_again.json()["is_adhoc_modified"] is True
        assert check_again.json()["shift_template_id"] == tid_b


@pytest.mark.asyncio
async def test_n66d_employer_cancellation_attendance_credit(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant_a, _ = seeded_tenants
    transport = ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Setup employee
        async with SessionLocal() as session:
            await set_tenant(session, tenant_a.id)
            branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
            emp_id = uuid4()
            session.add(
                Employee(
                    id=emp_id,
                    tenant_id=tenant_a.id,
                    branch_id=branch.id,
                    employee_code=f"N66D_{uuid4().hex[:6].upper()}",
                    full_name="Cancelled Session Employee",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )
            await session.commit()

        # Create template & materialize 1 day for 2026-12-25
        s_resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "code": f"CAN_{uuid4().hex[:6].upper()}",
                "name": "Regular Day",
                "sessions": [
                    {"session_order": 1, "start_time": "09:00:00", "end_time": "18:00:00"}
                ],
            },
        )
        tid = s_resp.json()["id"]

        await client.post(
            "/api/v1/roster/materialize",
            headers=headers,
            json={
                "employee_ids": [str(emp_id)],
                "start_date": "2026-12-25",
                "days": 1,
                "shift_template_id": tid,
            },
        )

        inst_resp = await client.get(
            f"/api/v1/roster/instances?employee_id={emp_id}&start_date=2026-12-25&end_date=2026-12-25",
            headers=headers,
        )
        inst_id = inst_resp.json()[0]["id"]

        # Cancel shift per N66d
        cancel_resp = await client.put(
            f"/api/v1/roster/instances/{inst_id}/cancel",
            headers=headers,
            json={"reason": "Severe weather factory shutdown (N66d)"},
        )
        assert cancel_resp.status_code == 200
        assert cancel_resp.json()["status"] == "CANCELLED_PAID"

        # Verify Attendance Engine credits this as PRESENT with 1.0 worked_ratio (BR-ROL-05)
        async with SessionLocal() as session:
            await set_tenant(session, tenant_a.id)
            rec, trace = await calculate_and_save_daily_attendance(
                session=session,
                tenant_id=tenant_a.id,
                employee_id=emp_id,
                calendar_date=date(2026, 12, 25),
            )
            assert rec.status == "PRESENT"
            assert float(rec.worked_ratio) == 1.0
            assert "N66d" in trace.trace_payload["summary"]["explanation"]


@pytest.mark.asyncio
async def test_roster_negative_rls(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant_a, tenant_b = seeded_tenants
    transport = ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Tenant A setup
        login_a = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers_a = {"Authorization": f"Bearer {login_a.json()['access_token']}"}

        pat_resp = await client.post(
            "/api/v1/roster/patterns",
            headers=headers_a,
            json={
                "code": f"RLS_P_{uuid4().hex[:6].upper()}",
                "name": "Tenant A Confidential Pattern",
                "cycle_length_days": 7,
                "day_shift_mapping": [{"day_index": i, "is_rest_day": True} for i in range(7)],
            },
        )
        assert pat_resp.status_code == 201
        pattern_id = pat_resp.json()["id"]

        # Tenant B login
        login_b = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@southmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

        # 1. Tenant B cannot get Tenant A pattern
        get_b = await client.get(f"/api/v1/roster/patterns/{pattern_id}", headers=headers_b)
        assert get_b.status_code == 404

        # 2. Direct SQL in Tenant B context returns None
        async with SessionLocal() as session_b:
            await set_tenant(session_b, tenant_b.id)
            inst = await session_b.scalar(
                select(DatedShiftInstance).where(DatedShiftInstance.tenant_id == tenant_a.id)
            )
            assert inst is None

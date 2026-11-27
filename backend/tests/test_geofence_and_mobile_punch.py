from datetime import UTC, datetime
from uuid import uuid4
import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Role, Tenant, User, UserRole


@pytest.mark.asyncio
async def test_branch_geofence_and_mobile_punch():
    async with MigrateSession() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        assert tenant is not None

        # Seed branch with geofence in Pune (e.g., Lat: 18.5204, Lon: 73.8567, Radius: 200m)
        branch_id = uuid4()
        branch = Branch(
            id=branch_id,
            tenant_id=tenant.id,
            name="Pune HQ Test",
            code=f"PUN_{uuid4().hex[:4].upper()}",
            registration_number="MH-PUN-001",
            geofence_latitude=18.5204,
            geofence_longitude=73.8567,
            geofence_radius_m=200,
            allowed_bssids=["00:11:22:33:44:55", "AA:BB:CC:DD:EE:FF"],
            is_active=True,
            created_at=datetime.now(UTC),
        )
        session.add(branch)

        # User & Employee
        user_id = uuid4()
        user = User(
            id=user_id,
            tenant_id=tenant.id,
            email=f"worker_{uuid4().hex[:6]}@northmill.example",
            full_name="Rohan Deshmukh",
            hashed_password=hash_password("Password-123"),
            is_active=True,
            created_at=datetime.now(UTC),
        )
        session.add(user)
        await session.flush()

        emp_id = uuid4()
        now = datetime.now(UTC)
        employee = Employee(
            id=emp_id,
            tenant_id=tenant.id,
            user_id=user_id,
            employee_code=f"EMP_GEO_{uuid4().hex[:4].upper()}",
            full_name="Rohan Deshmukh",
            date_of_joining=now.date(),
            branch_id=branch_id,
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        session.add(employee)

        admin_role = await session.scalar(
            select(Role).where(Role.tenant_id == tenant.id, Role.code == "TENANT_ADMIN")
        )
        assert admin_role is not None

        user_role = UserRole(
            id=uuid4(),
            tenant_id=tenant.id,
            user_id=user_id,
            role_id=admin_role.id,
        )
        session.add(user_role)
        await session.commit()

    token = create_access_token(user_id, tenant.id)
    headers = {"Authorization": f"Bearer {token}"}

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Test update branch geofence
        patch_res = await client.patch(
            f"/api/v1/branches/{branch_id}",
            json={
                "geofence_latitude": 18.5205,
                "geofence_longitude": 73.8568,
                "geofence_radius_m": 250,
                "allowed_bssids": ["00:11:22:33:44:55", "11:22:33:44:55:66"],
            },
            headers=headers,
        )
        assert patch_res.status_code == 200, patch_res.text
        updated = patch_res.json()
        assert updated["geofence_latitude"] == 18.5205
        assert updated["geofence_radius_m"] == 250
        assert "11:22:33:44:55:66" in updated["allowed_bssids"]

        # 2. Test ESS mobile punch context
        ctx_res = await client.get("/api/v1/ess/mobile-punch/context", headers=headers)
        assert ctx_res.status_code == 200, ctx_res.text
        ctx_data = ctx_res.json()
        assert ctx_data["employee_id"] == str(emp_id)
        assert ctx_data["branch"]["id"] == str(branch_id)
        assert ctx_data["branch"]["geofence_radius_m"] == 250
        assert "allowed_bssids" not in ctx_data["branch"]

        # 3. Test Punch IN within geofence (< 250m)
        punch_in_res = await client.post(
            "/api/v1/ess/mobile-punch",
            json={
                "punch_direction": "IN",
                "latitude": 18.52055,
                "longitude": 73.85682,
                "accuracy_m": 12.5,
            },
            headers=headers,
        )
        assert punch_in_res.status_code == 200, punch_in_res.text
        in_data = punch_in_res.json()
        assert in_data["geofence_verified"] is True
        assert in_data["distance_m"] is not None
        assert in_data["distance_m"] < 50
        assert in_data["ingest"]["active_punches"] == 1

        # 4. A punch outside the saved radius is refused and not stored.
        punch_out_far = await client.post(
            "/api/v1/ess/mobile-punch",
            json={
                "punch_direction": "OUT",
                "latitude": 18.5500,  # ~3.3km away
                "longitude": 73.8568,
                "accuracy_m": 10.0,
            },
            headers=headers,
        )
        assert punch_out_far.status_code == 422, punch_out_far.text
        assert punch_out_far.json()["title"] == "Outside the branch geofence"

        # 5. A posted BSSID does not authorize an outside punch.
        punch_out_wifi = await client.post(
            "/api/v1/ess/mobile-punch",
            json={
                "punch_direction": "OUT",
                "latitude": 18.5500,
                "longitude": 73.8568,
                "bssid": "00:11:22:33:44:55",
            },
            headers=headers,
        )
        assert punch_out_wifi.status_code == 422, punch_out_wifi.text

        # 6. The generic ingest path cannot bypass the geofence check.
        ingest_res = await client.post(
            "/api/v1/punches/ingest",
            json={
                "source": "MOBILE_GEO",
                "raw_payload": {
                    "employee_code": ctx_data["employee_code"],
                    "latitude": 18.5500,
                    "longitude": 73.8568,
                    "geofence_verified": True,
                },
            },
            headers=headers,
        )
        assert ingest_res.status_code == 422, ingest_res.text

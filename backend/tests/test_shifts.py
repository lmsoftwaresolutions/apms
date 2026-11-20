from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.main import app
from app.models.iam import Tenant
from app.models.shift import ShiftSession, ShiftTemplate


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_fixed_shift_template_crud() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        code = f"FX_{uuid4().hex[:6].upper()}"
        create_payload = {
            "code": code,
            "name": "General Fixed 9h Shift",
            "shift_type": "FIXED",
            "color_code": "#00AAFF",
            "sessions": [
                {
                    "session_order": 1,
                    "name": "Full Day Session",
                    "start_time": "09:00:00",
                    "end_time": "18:00:00",
                    "pre_window_minutes": 60,
                    "post_window_minutes": 120,
                    "min_presence_ratio": 0.50,
                    "break_duration_minutes": 60,
                }
            ],
        }

        # 1. Create template
        create_resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json=create_payload,
        )
        assert create_resp.status_code == 201, create_resp.text
        data = create_resp.json()
        assert data["code"] == code
        assert data["is_overnight"] is False
        assert len(data["sessions"]) == 1
        template_id = data["id"]

        # 2. Get template by ID
        get_resp = await client.get(f"/api/v1/shifts/templates/{template_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["id"] == template_id

        # 3. Update template
        update_resp = await client.put(
            f"/api/v1/shifts/templates/{template_id}",
            headers=headers,
            json={"name": "Updated Fixed Shift", "color_code": "#0088CC"},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "Updated Fixed Shift"
        assert update_resp.json()["color_code"] == "#0088CC"

        # 4. List templates
        list_resp = await client.get("/api/v1/shifts/templates", headers=headers)
        assert list_resp.status_code == 200
        assert any(t["id"] == template_id for t in list_resp.json())

        # 5. Delete template
        del_resp = await client.delete(f"/api/v1/shifts/templates/{template_id}", headers=headers)
        assert del_resp.status_code == 204

        # Verify 404 after deletion
        get_again = await client.get(f"/api/v1/shifts/templates/{template_id}", headers=headers)
        assert get_again.status_code == 404


@pytest.mark.asyncio
async def test_overnight_shift_auto_detection() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # Shift 22:00 to 06:00 next day (end_time < start_time)
        code = f"NGT_{uuid4().hex[:6].upper()}"
        create_payload = {
            "code": code,
            "name": "Night Shift (BR-ATT-03)",
            "shift_type": "FIXED",
            "sessions": [
                {
                    "session_order": 1,
                    "name": "Night Session",
                    "start_time": "22:00:00",
                    "end_time": "06:00:00",
                    "pre_window_minutes": 60,
                    "post_window_minutes": 120,
                    "min_presence_ratio": 0.50,
                }
            ],
        }

        resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json=create_payload,
        )
        assert resp.status_code == 201, resp.text
        data = resp.json()
        assert data["is_overnight"] is True
        assert data["shift_type"] == "OVERNIGHT"
        assert data["sessions"][0]["is_overnight"] is True


@pytest.mark.asyncio
async def test_split_shift_validation() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        # 1. Valid Split Shift: 08:00 - 12:00, gap 12:00-16:00 (N65), 16:00 - 20:00
        code = f"SPL_{uuid4().hex[:6].upper()}"
        valid_payload = {
            "code": code,
            "name": "Valid Split Shift (N65)",
            "shift_type": "SPLIT",
            "sessions": [
                {
                    "session_order": 1,
                    "name": "Morning Session",
                    "start_time": "08:00:00",
                    "end_time": "12:00:00",
                    "min_presence_ratio": 0.50,
                },
                {
                    "session_order": 2,
                    "name": "Evening Session",
                    "start_time": "16:00:00",
                    "end_time": "20:00:00",
                    "min_presence_ratio": 0.50,
                },
            ],
        }
        resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json=valid_payload,
        )
        assert resp.status_code == 201, resp.text
        assert len(resp.json()["sessions"]) == 2

        # 2. Overlapping Split Shift: Session 1 ends 13:00, Session 2 starts 12:00 -> Rejected with 422
        bad_payload = {
            "code": f"BAD_{uuid4().hex[:6].upper()}",
            "name": "Overlapping Sessions",
            "shift_type": "SPLIT",
            "sessions": [
                {
                    "session_order": 1,
                    "name": "Session 1",
                    "start_time": "08:00:00",
                    "end_time": "13:00:00",
                },
                {
                    "session_order": 2,
                    "name": "Session 2",
                    "start_time": "12:00:00",
                    "end_time": "17:00:00",
                },
            ],
        }
        bad_resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json=bad_payload,
        )
        assert bad_resp.status_code == 422
        assert "overlaps" in bad_resp.json()["detail"].lower()


@pytest.mark.asyncio
async def test_duplicate_code_conflict() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers = {"Authorization": f"Bearer {login_resp.json()['access_token']}"}

        code = f"DUP_{uuid4().hex[:6].upper()}"
        payload = {
            "code": code,
            "name": "Unique Shift",
            "sessions": [
                {"session_order": 1, "start_time": "09:00:00", "end_time": "17:00:00"}
            ],
        }

        r1 = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json=payload,
        )
        assert r1.status_code == 201

        r2 = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json=payload,
        )
        assert r2.status_code == 409


@pytest.mark.asyncio
async def test_shifts_negative_rls(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant_a, tenant_b = seeded_tenants
    transport = ASGITransport(app=app)

    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # Create template in Tenant A (northmill)
        login_a = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers_a = {"Authorization": f"Bearer {login_a.json()['access_token']}"}

        t_resp = await client.post(
            "/api/v1/shifts/templates",
            headers={**headers_a, "Idempotency-Key": str(uuid4())},
            json={
                "code": f"RLS_A_{uuid4().hex[:6].upper()}",
                "name": "Tenant A Secret Shift",
                "sessions": [
                    {"session_order": 1, "start_time": "09:00:00", "end_time": "18:00:00"}
                ],
            },
        )
        assert t_resp.status_code == 201
        template_id = t_resp.json()["id"]

        # Login as Tenant B (southmill)
        login_b = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@southmill.example", "password": "ChangeMe-Admin-1"},
        )
        headers_b = {"Authorization": f"Bearer {login_b.json()['access_token']}"}

        # 1. Tenant B cannot get Tenant A's template by ID
        get_b = await client.get(f"/api/v1/shifts/templates/{template_id}", headers=headers_b)
        assert get_b.status_code == 404

        # 2. Tenant B cannot update Tenant A's template
        put_b = await client.put(
            f"/api/v1/shifts/templates/{template_id}",
            headers=headers_b,
            json={"name": "Hacked Name"},
        )
        assert put_b.status_code == 404

        # 3. Direct SQL query in Tenant B context returns 0 rows
        async with SessionLocal() as session_b:
            await set_tenant(session_b, tenant_b.id)
            direct = await session_b.scalar(
                select(ShiftTemplate).where(ShiftTemplate.id == template_id)
            )
            assert direct is None

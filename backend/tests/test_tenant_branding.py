import httpx
import pytest
from httpx import ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_tenant_branding_update_validation_and_rbac() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        admin_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert admin_login.status_code == 200
        admin_headers = {"Authorization": f"Bearer {admin_login.json()['access_token']}"}

        sup_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "supervisor@northmill.example", "password": "ChangeMe-Supervisor-1"},
        )
        assert sup_login.status_code == 200
        sup_headers = {"Authorization": f"Bearer {sup_login.json()['access_token']}"}

        me_before = await client.get("/api/v1/auth/me", headers=admin_headers)
        assert me_before.status_code == 200
        orig_name = me_before.json()["tenant"]["display_name"]
        orig_logo = me_before.json()["tenant"]["logo_url"]

        try:
            # Supervisor lacks org.tenant.update permission
            forbidden = await client.patch(
                "/api/v1/auth/tenant",
                headers=sup_headers,
                json={"display_name": "Unauthorized Rename"},
            )
            assert forbidden.status_code == 403

            # Reject unsafe URL schemes
            invalid_logo = await client.patch(
                "/api/v1/auth/tenant",
                headers=admin_headers,
                json={"logo_url": "javascript:alert(1)"},
            )
            assert invalid_logo.status_code == 422

            # Set valid display_name and logo_url
            updated = await client.patch(
                "/api/v1/auth/tenant",
                headers=admin_headers,
                json={"display_name": "North Mill Textiles", "logo_url": "https://example.com/logo.png"},
            )
            assert updated.status_code == 200
            assert updated.json()["display_name"] == "North Mill Textiles"
            assert updated.json()["logo_url"] == "https://example.com/logo.png"

            # Blank logo_url clears logo back to None
            cleared = await client.patch(
                "/api/v1/auth/tenant",
                headers=admin_headers,
                json={"logo_url": ""},
            )
            assert cleared.status_code == 200
            assert cleared.json()["logo_url"] is None
        finally:
            await client.patch(
                "/api/v1/auth/tenant",
                headers=admin_headers,
                json={"display_name": orig_name, "logo_url": orig_logo},
            )

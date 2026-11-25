from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport

from app.main import app


@pytest.mark.asyncio
async def test_employee_api_crud_and_masking() -> None:
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as North Mill admin
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Get branches to find a valid branch_id
        branches_resp = await client.get("/api/v1/branches", headers=headers)
        assert branches_resp.status_code == 200
        branch_id = branches_resp.json()[0]["id"]

        # 3. Create employee with raw PII
        emp_code = f"API-{uuid4().hex[:6].upper()}"
        pan_num = uuid4().int % 9000 + 1000
        aadhaar_num = uuid4().int % 9000 + 1000
        bank_num = uuid4().int % 9000 + 1000
        create_payload = {
            "employee_code": emp_code,
            "full_name": "API Test Employee",
            "branch_id": branch_id,
            "date_of_joining": "2026-02-01",
            "pan": f"ABCDE{pan_num}F",
            "aadhaar": f"99998888{aadhaar_num}",
            "bank_account": f"11223344{bank_num}",
            "bank_ifsc": "HDFC0001234",
            "biometric_consent": True,
        }
        idempotency_key = str(uuid4())
        create_resp = await client.post(
            "/api/v1/employees",
            headers={**headers, "Idempotency-Key": idempotency_key},
            json=create_payload,
        )
        assert create_resp.status_code == 201, f"Create employee failed: {create_resp.text}"
        data = create_resp.json()
        emp_id = data["id"]

        # Verify masked output in API response
        assert data["pan_masked"] == f"XXXXX{pan_num}"
        assert data["aadhaar_masked"] == f"XXXXXXXX{aadhaar_num}"
        assert data["bank_account_masked"] == f"XXXXXXXX{bank_num}"
        assert data["bank_ifsc_masked"] == "XXXXXXX1234"
        assert data["biometric_consent_at"] is not None
        # Verify raw PII does not exist in response keys
        assert "pan" not in data
        assert "aadhaar" not in data
        assert "bank_account" not in data
        assert "bank_ifsc" not in data

        # 4. Idempotent replay test: Re-send identical POST with same Idempotency-Key
        replay_resp = await client.post(
            "/api/v1/employees",
            headers={**headers, "Idempotency-Key": idempotency_key},
            json=create_payload,
        )
        assert replay_resp.status_code == 201
        assert replay_resp.json()["id"] == emp_id

        # 5. Get employee by ID
        get_resp = await client.get(f"/api/v1/employees/{emp_id}", headers=headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["employee_code"] == emp_code

        # 6. List employees with branch filter
        list_resp = await client.get(
            f"/api/v1/employees?branch_id={branch_id}",
            headers=headers,
        )
        assert list_resp.status_code == 200
        assert any(e["id"] == emp_id for e in list_resp.json())

        # 7. Update employee (modify designation and withdraw biometric consent)
        update_resp = await client.patch(
            f"/api/v1/employees/{emp_id}",
            headers=headers,
            json={"designation": "Lead Engineer", "biometric_consent": False},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["designation"] == "Lead Engineer"
        assert update_resp.json()["biometric_consent_at"] is None

        # 8. Delete employee
        delete_resp = await client.delete(f"/api/v1/employees/{emp_id}", headers=headers)
        assert delete_resp.status_code == 200
        assert delete_resp.json()["id"] == emp_id

        # 9. Offboarding keeps the row and marks the employee inactive
        get_after_delete = await client.get(f"/api/v1/employees/{emp_id}", headers=headers)
        assert get_after_delete.status_code == 200
        assert get_after_delete.json()["is_active"] is False

        # 10. Attempting to assign an employee to an inactive branch fails with 400
        branch_code = f"I{uuid4().hex[:3].upper()}"
        branch_resp = await client.post(
            "/api/v1/branches",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={"name": "Temp Inactive Branch", "code": branch_code},
        )
        assert branch_resp.status_code == 201
        inactive_branch_id = branch_resp.json()["id"]
        # Deactivate branch
        deact_resp = await client.patch(
            f"/api/v1/branches/{inactive_branch_id}",
            headers=headers,
            json={"is_active": False},
        )
        assert deact_resp.status_code == 200
        # Try creating employee under the inactive branch
        fail_create_resp = await client.post(
            "/api/v1/employees",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "employee_code": f"FAIL-{uuid4().hex[:4].upper()}",
                "full_name": "Should Fail Employee",
                "branch_id": inactive_branch_id,
                "date_of_joining": "2026-02-01",
            },
        )
        assert fail_create_resp.status_code == 400
        assert "Inactive branch" in fail_create_resp.text

        # Clean up temporary branch created during negative test
        del_branch_resp = await client.delete(f"/api/v1/branches/{inactive_branch_id}", headers=headers)
        assert del_branch_resp.status_code == 200

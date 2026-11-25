import calendar
import csv
import io
from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import uuid4

import httpx
import openpyxl
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.attendance import AttendanceDailyRecord
from app.models.branch import Branch
from app.models.department import Department
from app.models.employee import Employee
from app.models.iam import Role, Tenant, User, UserRole
from app.models.leave import LeaveRequest, LeaveType
from app.modules.muster.export.csv import stream_muster_csv
from app.modules.muster.export.excel import generate_muster_xlsx
from app.modules.muster.export.pdf import generate_muster_pdf
from app.modules.muster.service import classify_muster_cell, export_muster, fetch_muster


@pytest.fixture
def sample_muster_data():
    """Deterministic sample muster data for 31 days (January 2026)."""
    return {
        "meta": {
            "tenant_id": str(uuid4()),
            "tenant_name": "Apex Precision Mills",
            "branch_name": "North Spinning Unit",
            "year": 2026,
            "month": 1,
            "month_name": "January",
            "total_days": 31,
            "generated_at": "2026-01-31 23:59:59 UTC",
            "department_id": None,
            "registration_number": "REG-FAC-1948-TN",
            "factory_name": "Apex Precision Mills - Unit 1",
            "establishment_name": "Apex Precision Mills",
            "contractor_name": "N/A - Direct Employment",
        },
        "days": list(range(1, 32)),
        "employees": [
            {
                "employee_id": str(uuid4()),
                "employee_code": "AP-001",
                "employee_name": "Rajesh Kumar",
                "department": "Spinning",
                "designation": "Technician",
                "branch": "North Spinning Unit",
                "daily_status": {
                    1: "P", 2: "P", 3: "P", 4: "WO", 5: "P", 6: "P", 7: "P",
                    8: "P", 9: "HD", 10: "P", 11: "WO", 12: "CL", 13: "P", 14: "P",
                    15: "H", 16: "P", 17: "P", 18: "WO", 19: "P", 20: "P", 21: "A",
                    22: "P", 23: "P", 24: "P", 25: "WO", 26: "H", 27: "P", 28: "P",
                    29: "P", 30: "P", 31: "P",
                },
                "summary": {
                    "total_days": 31,
                    "total_present": 23.5,
                    "total_absent": 1.5,
                    "total_leave": 1.0,
                    "worked_hours": 188.0,
                    "ot_hours": 8.5,
                },
            },
            {
                "employee_id": str(uuid4()),
                "employee_code": "AP-002",
                "employee_name": "Sunita Sharma",
                "department": "Weaving",
                "designation": "Operator",
                "branch": "North Spinning Unit",
                "daily_status": {
                    1: "P", 2: "P", 3: "P", 4: "WO", 5: "P", 6: "P", 7: "P",
                    8: "P", 9: "P", 10: "P", 11: "WO", 12: "SL", 13: "SL", 14: "P",
                    15: "H", 16: "P", 17: "P", 18: "WO", 19: "P", 20: "P", 21: "P",
                    22: "P", 23: "P", 24: "P", 25: "WO", 26: "H", 27: "P", 28: "P",
                    29: "P", 30: "P", 31: "P",
                },
                "summary": {
                    "total_days": 31,
                    "total_present": 23.0,
                    "total_absent": 0.0,
                    "total_leave": 2.0,
                    "worked_hours": 184.0,
                    "ot_hours": 4.0,
                },
            },
        ],
    }


def test_excel_structure_and_no_wage_columns(sample_muster_data):
    """Excel Structure Test: Verify generated .xlsx loads via openpyxl,

    contains exact 31-day column headers, employee rows, and computed summary
    totals without wage columns.
    """
    buffer = generate_muster_xlsx(
        sample_muster_data,
        sample_muster_data["meta"],
        2026,
        1,
    )
    assert isinstance(buffer, io.BytesIO)
    buffer.seek(0)

    wb = openpyxl.load_workbook(buffer)
    ws = wb.active
    assert ws.title == "Muster_2026_01"

    # Row 1 header block
    assert "Apex Precision Mills" in str(ws["A1"].value)

    # Row 5 table headers
    row_5_values = [cell.value for cell in ws[5]]

    # 1. Employee metadata columns
    assert row_5_values[0] == "Employee Code"
    assert row_5_values[1] == "Employee Name"
    assert row_5_values[2] == "Department"
    assert row_5_values[3] == "Designation"

    # 2. Exact 31-day column headers (Day 1 to 31)
    day_headers = row_5_values[4:35]
    assert len(day_headers) == 31
    assert day_headers == list(range(1, 32))

    # 3. Summary totals columns
    summary_headers = row_5_values[35:41]
    assert summary_headers == [
        "Total Days in Month",
        "Total Present Days",
        "Total Leave Days",
        "Total Absent",
        "Total Worked Hours",
        "Total Overtime Hours",
    ]

    # 4. Verify employee rows
    assert ws.cell(row=6, column=1).value == "AP-001"
    assert ws.cell(row=6, column=2).value == "Rajesh Kumar"
    assert ws.cell(row=6, column=5).value == "P"  # Day 1
    assert ws.cell(row=6, column=8).value == "WO"  # Day 4
    assert ws.cell(row=6, column=16).value == "CL"  # Day 12
    # Verify summary numbers
    assert ws.cell(row=6, column=36).value == 31
    assert ws.cell(row=6, column=37).value == 23.5
    assert ws.cell(row=6, column=40).value == 188.0

    # 5. Legend & Statutory Disclaimer exist at bottom
    all_values = [str(c.value) for row in ws.iter_rows() for c in row if c.value is not None]
    assert any("STATUS CODES LEGEND" in v for v in all_values)
    assert any("STATUTORY COMPLIANCE DISCLAIMER" in v for v in all_values)

    # 6. Strict Wage Pollution Invariant: Neither wage, salary, basic, pf, nor esi
    for val in all_values:
        low = val.lower()
        for forbidden in ("wage", "salary", "basic", "pf", "esi"):
            # Ensure forbidden words do not appear as column headers or data keys
            assert forbidden not in low.split(), f"Wage pollution detected: {val}"


@pytest.mark.asyncio
async def test_streaming_csv_structure_and_bom(sample_muster_data):
    """Streaming CSV Test: Verify stream_muster_csv yields valid CSV rows

    matching input data, starts with UTF-8 BOM, and contains no wage columns.
    """
    chunks = []
    async for chunk in stream_muster_csv(
        sample_muster_data,
        sample_muster_data["meta"],
        2026,
        1,
    ):
        chunks.append(chunk)

    full_csv = "".join(chunks)

    # 1. Verify UTF-8 BOM
    assert full_csv.startswith("\ufeff"), "CSV stream must begin with UTF-8 BOM"

    # 2. Parse CSV
    reader = csv.reader(io.StringIO(full_csv.lstrip("\ufeff")))
    rows = list(reader)
    assert len(rows) == 3  # Header + 2 employees

    header = rows[0]
    expected_header = [
        "employee_code",
        "employee_name",
        "department",
        "designation",
        *[f"day_{d}" for d in range(1, 32)],
        "total_present",
        "total_absent",
        "total_leave",
        "worked_hours",
        "ot_hours",
    ]
    assert header == expected_header

    # Verify AP-001 row
    emp1_row = rows[1]
    assert emp1_row[0] == "AP-001"
    assert emp1_row[1] == "Rajesh Kumar"
    assert emp1_row[4] == "P"  # day_1
    assert emp1_row[7] == "WO"  # day_4
    assert emp1_row[35] == "23.5"  # total_present
    assert emp1_row[38] == "188.0"  # worked_hours

    # 3. No Wage Pollution in CSV
    for cell in [c for r in rows for c in r]:
        low = cell.lower()
        for forbidden in ("wage", "salary", "basic", "pf", "esi"):
            assert forbidden not in low.split(), f"Wage pollution in CSV: {cell}"


def test_statutory_pdf_generation_form_25(sample_muster_data):
    """Statutory PDF Test: Verify PDF generation produces valid %PDF- binary

    with statutory Form 25 headers.
    """
    pdf_buffer = generate_muster_pdf(
        sample_muster_data,
        sample_muster_data["meta"],
        2026,
        1,
        template="form_25",
    )
    assert isinstance(pdf_buffer, io.BytesIO)
    content = pdf_buffer.getvalue()

    # 1. Valid PDF binary header
    assert content.startswith(b"%PDF-"), "Generated file must be a valid PDF binary"
    assert len(content) > 1000

    # 2. Verify statutory form templates
    for tpl in ("form_ii", "form_t", "standard"):
        buf = generate_muster_pdf(
            sample_muster_data,
            sample_muster_data["meta"],
            2026,
            1,
            template=tpl,
        )
        assert buf.getvalue().startswith(b"%PDF-")


@pytest.mark.asyncio
async def test_fetch_muster_service_layer():
    """Verify fetch_muster pulls attendance and leave marks without wages."""
    async with MigrateSession() as session:
        tenant = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        assert tenant

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        muster_result = await fetch_muster(session, tenant.id, year=2026, month=11)

        assert "meta" in muster_result
        assert "days" in muster_result
        assert "employees" in muster_result
        assert muster_result["meta"]["month"] == 11
        assert muster_result["meta"]["total_days"] == 30
        assert len(muster_result["days"]) == 30

        # Assert no wage pollution in dict keys
        for emp in muster_result["employees"]:
            assert "wage" not in emp
            assert "salary" not in emp
            assert "summary" in emp
            assert "worked_hours" in emp["summary"]


@pytest.mark.asyncio
async def test_export_endpoint_integration_and_permissions():
    """Test GET /api/v1/muster/export with authentication, roles, and formats."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthenticated request -> 401
        unauth_resp = await client.get("/api/v1/muster/export?year=2026&month=11")
        assert unauth_resp.status_code == 401

        # 2. Login as North Mill admin (has muster.export.read)
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 3. Export XLSX
        xlsx_resp = await client.get(
            "/api/v1/muster/export?year=2026&month=11&format=xlsx&template=standard",
            headers=headers,
        )
        assert xlsx_resp.status_code == 200
        assert xlsx_resp.headers["content-type"] == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        assert 'attachment; filename="muster_roll_2026_11_standard.xlsx"' in xlsx_resp.headers["content-disposition"]
        wb = openpyxl.load_workbook(io.BytesIO(xlsx_resp.content))
        assert wb.active is not None

        # 4. Export CSV
        csv_resp = await client.get(
            "/api/v1/muster/export?year=2026&month=11&format=csv",
            headers=headers,
        )
        assert csv_resp.status_code == 200
        assert "text/csv" in csv_resp.headers["content-type"]
        assert 'attachment; filename="muster_roll_2026_11_standard.csv"' in csv_resp.headers["content-disposition"]
        assert csv_resp.text.startswith("\ufeff")

        # 5. Export PDF (Form 25)
        pdf_resp = await client.get(
            "/api/v1/muster/export?year=2026&month=11&format=pdf&template=form_25",
            headers=headers,
        )
        assert pdf_resp.status_code == 200
        assert pdf_resp.headers["content-type"] == "application/pdf"
        assert 'attachment; filename="muster_roll_2026_11_form_25.pdf"' in pdf_resp.headers["content-disposition"]
        assert pdf_resp.content.startswith(b"%PDF-")

        # 6. Test GET /api/v1/muster/lines
        lines_resp = await client.get("/api/v1/muster/lines?year=2026&month=11", headers=headers)
        assert lines_resp.status_code == 200
        assert isinstance(lines_resp.json(), list)


@pytest.mark.asyncio
async def test_tenant_isolation_and_403_forbidden():
    """Verify Tenant Isolation under RLS and 403 on unauthorized user."""
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b

        # Create an employee user in Tenant A who only has EMPLOYEE role (no muster.export.read)
        role_emp = await session.scalar(
            select(Role).where(Role.tenant_id == tenant_a.id, Role.code == "EMPLOYEE")
        )
        assert role_emp

        emp_user = User(
            id=uuid4(),
            tenant_id=tenant_a.id,
            email=f"emp_{uuid4().hex[:6]}@northmill.example",
            full_name="Regular Employee",
            hashed_password=hash_password("Password-123"),
            is_active=True,
            created_at=datetime.now(UTC),
        )
        session.add(emp_user)
        await session.flush()

        session.add(
            UserRole(
                id=uuid4(),
                tenant_id=tenant_a.id,
                user_id=emp_user.id,
                role_id=role_emp.id,
            )
        )
        await session.commit()

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Employee login -> lacks muster.export.read -> 403 Forbidden
        emp_token = create_access_token(emp_user.id, tenant_a.id)
        emp_headers = {"Authorization": f"Bearer {emp_token}"}
        resp_403 = await client.get(
            "/api/v1/muster/export?year=2026&month=11&format=csv",
            headers=emp_headers,
        )
        assert resp_403.status_code == 403

        # 2. Tenant B Admin Login
        login_b = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@southmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_b.status_code == 200
        token_b = login_b.json()["access_token"]
        headers_b = {"Authorization": f"Bearer {token_b}"}

        # 3. Export Tenant B muster
        resp_b = await client.get(
            "/api/v1/muster/export?year=2026&month=11&format=csv",
            headers=headers_b,
        )
        assert resp_b.status_code == 200
        # Tenant B export must NOT contain any Tenant A data
        reader = csv.reader(io.StringIO(resp_b.text.lstrip("\ufeff")))
        b_rows = list(reader)
        b_emp_codes = [r[0] for r in b_rows[1:]]

        # Verify none of Tenant A employees are in Tenant B
        async with SessionLocal() as s_a:
            await set_tenant(s_a, tenant_a.id)
            a_employees = (await s_a.scalars(select(Employee).where(Employee.tenant_id == tenant_a.id))).all()
            a_codes = {e.employee_code for e in a_employees}
            for code in b_emp_codes:
                assert code not in a_codes, f"Cross-tenant leak detected: {code}"


def test_muster_marks_pre_joining_inactive_and_keeps_review_off_absent():
    joined = date(2026, 11, 10)
    mark, present, absent, leave = classify_muster_cell(
        calendar_date=date(2026, 11, 1),
        date_of_joining=joined,
        attendance_status="ABSENT",
        worked_minutes=0,
        leave_code=None,
        leave_days=None,
        leave_portion=None,
        is_holiday=False,
        shift_is_rest=False,
    )
    assert (mark, present, absent, leave) == ("-", 0.0, 0.0, 0.0)

    review = classify_muster_cell(
        calendar_date=date(2026, 11, 12),
        date_of_joining=joined,
        attendance_status="NEEDS_REVIEW",
        worked_minutes=0,
        leave_code=None,
        leave_days=None,
        leave_portion=None,
        is_holiday=False,
        shift_is_rest=False,
    )
    assert review[0] == "NR"
    assert review[2] == 0.0


def test_muster_weekly_off_follows_the_shift_not_the_weekday():
    sunday = date(2026, 11, 1)  # Sunday
    working_sunday = classify_muster_cell(
        calendar_date=sunday,
        date_of_joining=date(2026, 1, 1),
        attendance_status=None,
        worked_minutes=0,
        leave_code=None,
        leave_days=None,
        leave_portion=None,
        is_holiday=False,
        shift_is_rest=False,
    )
    assert working_sunday[0] == "A"
    rest = classify_muster_cell(
        calendar_date=date(2026, 11, 3),
        date_of_joining=date(2026, 1, 1),
        attendance_status=None,
        worked_minutes=0,
        leave_code=None,
        leave_days=None,
        leave_portion=None,
        is_holiday=False,
        shift_is_rest=True,
    )
    assert rest[0] == "WO"


@pytest.mark.asyncio
async def test_export_muster_forwards_department_filter(monkeypatch):
    seen: dict[str, object] = {}

    async def fake_list(session, tenant_id, branch_id=None, department_id=None, is_active=None):
        seen["department_id"] = department_id
        seen["branch_id"] = branch_id
        return []

    async def fake_attendance(*args, **kwargs):
        return []

    async def fake_leave(*args, **kwargs):
        return []

    monkeypatch.setattr("app.modules.muster.service.list_employees_by_tenant", fake_list)
    monkeypatch.setattr("app.modules.muster.service.list_attendance_records", fake_attendance)
    monkeypatch.setattr("app.modules.muster.service.approved_leave_marks", fake_leave)
    department_id = uuid4()
    rows = await export_muster(
        None,
        uuid4(),
        date(2026, 11, 1),
        date(2026, 11, 30),
        None,
        department_id=department_id,
    )
    assert rows == []
    assert seen["department_id"] == department_id

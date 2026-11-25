from datetime import UTC, date, datetime
from decimal import Decimal
from uuid import UUID, uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.main import app
from app.models.attendance import AttendanceDailyRecord
from app.models.branch import Branch
from app.models.department import Department
from app.models.employee import Employee
from app.models.iam import Tenant
from app.modules.branches import service as branch_service
from app.modules.muster.service import export_muster, fetch_muster


@pytest.mark.asyncio
async def test_delete_branch_with_dependents_returns_conflict(monkeypatch):
    branch = Branch(
        id=uuid4(),
        tenant_id=uuid4(),
        name="North",
        code="NORTH",
        is_active=True,
        created_at=datetime.now(UTC),
    )

    async def get_branch(*args, **kwargs):
        return branch

    async def blocked_delete(*args, **kwargs):
        raise IntegrityError("DELETE", {}, Exception("fk_employees_branch"))

    monkeypatch.setattr(branch_service.branch_repo, "get_branch_by_id", get_branch)
    monkeypatch.setattr(branch_service.branch_repo, "delete_branch_record", blocked_delete)

    with pytest.raises(ProblemError) as exc:
        await branch_service.delete_branch(None, branch.tenant_id, branch.id)

    assert exc.value.status == 409
    assert exc.value.title == "Branch in use"


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_department_filter_and_registration_number_hit_postgres(seeded_tenants: tuple[Tenant, Tenant]):
    tenant, _other = seeded_tenants
    suffix = uuid4().hex[:6].upper()
    branch_id = uuid4()
    spinning_id = uuid4()
    weaving_id = uuid4()
    spinning_emp = uuid4()
    weaving_emp = uuid4()
    day = date(2026, 11, 2)
    now = datetime.now(UTC)
    spinning_code = f"SP{suffix}"
    weaving_code = f"WV{suffix}"

    async with MigrateSession() as session:
        session.add(
            Branch(
                id=branch_id,
                tenant_id=tenant.id,
                name="Registration Unit",
                code=f"RU{suffix[:4]}",
                registration_number=f"FAC-{suffix}",
                is_active=True,
                created_at=now,
            )
        )
        await session.flush()
        session.add_all(
            [
                Department(
                    id=spinning_id,
                    tenant_id=tenant.id,
                    branch_id=branch_id,
                    name="Spinning",
                    code=spinning_code,
                    is_active=True,
                    created_at=now,
                ),
                Department(
                    id=weaving_id,
                    tenant_id=tenant.id,
                    branch_id=branch_id,
                    name="Weaving",
                    code=weaving_code,
                    is_active=True,
                    created_at=now,
                ),
            ]
        )
        await session.flush()
        session.add_all(
            [
                Employee(
                    id=spinning_emp,
                    tenant_id=tenant.id,
                    branch_id=branch_id,
                    department_id=spinning_id,
                    employee_code=f"SPN-{suffix}",
                    full_name="Spinning Worker",
                    employment_type="FULL_TIME",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                ),
                Employee(
                    id=weaving_emp,
                    tenant_id=tenant.id,
                    branch_id=branch_id,
                    department_id=weaving_id,
                    employee_code=f"WEV-{suffix}",
                    full_name="Weaving Worker",
                    employment_type="FULL_TIME",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                ),
            ]
        )
        await session.flush()
        for employee_id in (spinning_emp, weaving_emp):
            session.add(
                AttendanceDailyRecord(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    employee_id=employee_id,
                    calendar_date=day,
                    status="PRESENT",
                    worked_duration_minutes=480,
                    scheduled_duration_minutes=540,
                    worked_ratio=Decimal("0.8889"),
                    late_minutes=0,
                    early_departure_minutes=0,
                    overtime_minutes=0,
                    is_single_punch=False,
                    created_at=now,
                    updated_at=now,
                )
            )
        await session.commit()

    try:
        async with SessionLocal() as session:
            await set_tenant(session, tenant.id)
            lines = await export_muster(
                session,
                tenant.id,
                date(2026, 11, 1),
                date(2026, 11, 30),
                branch_id,
                department_id=spinning_id,
            )
            muster = await fetch_muster(session, tenant.id, 2026, 11, department_id=spinning_id)
        codes = {row["employee_code"] for row in lines}
        assert codes == {f"SPN-{suffix}"}
        assert muster["meta"]["registration_number"] == f"FAC-{suffix}"
        assert muster["meta"]["registration_number"] != f"RU{suffix[:4]}"
        assert [row["employee_code"] for row in muster["employees"]] == [f"SPN-{suffix}"]
    finally:
        async with MigrateSession() as session:
            records = (
                await session.scalars(
                    select(AttendanceDailyRecord).where(AttendanceDailyRecord.employee_id.in_([spinning_emp, weaving_emp]))
                )
            ).all()
            for record in records:
                await session.delete(record)
            for employee_id in (spinning_emp, weaving_emp):
                employee = await session.get(Employee, employee_id)
                if employee is not None:
                    await session.delete(employee)
            await session.flush()
            for department_id in (spinning_id, weaving_id):
                department = await session.get(Department, department_id)
                if department is not None:
                    await session.delete(department)
            branch = await session.get(Branch, branch_id)
            if branch is not None:
                await session.delete(branch)
            await session.commit()


@pytest.mark.asyncio
async def test_delete_branch_with_employee_returns_409(seeded_tenants: tuple[Tenant, Tenant]):
    tenant, _other = seeded_tenants
    suffix = uuid4().hex[:6].upper()
    now = datetime.now(UTC)
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        login = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login.status_code == 200
        headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
        created = await client.post(
            "/api/v1/branches",
            headers=headers,
            json={"name": "Temporary Unit", "code": f"TU{suffix[:4]}"},
        )
        assert created.status_code == 201
        branch_id = UUID(created.json()["id"])
        employee_id = uuid4()
        async with MigrateSession() as session:
            session.add(
                Employee(
                    id=employee_id,
                    tenant_id=tenant.id,
                    branch_id=branch_id,
                    employee_code=f"TMP-{suffix}",
                    full_name="Temporary Worker",
                    employment_type="FULL_TIME",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=now,
                    updated_at=now,
                )
            )
            await session.commit()
        try:
            blocked = await client.delete(f"/api/v1/branches/{branch_id}", headers=headers)
            assert blocked.status_code == 409
            assert blocked.json()["title"] == "Branch in use"
        finally:
            async with MigrateSession() as session:
                employee = await session.get(Employee, employee_id)
                if employee is not None:
                    await session.delete(employee)
                await session.commit()
            cleared = await client.delete(f"/api/v1/branches/{branch_id}", headers=headers)
            assert cleared.status_code == 200

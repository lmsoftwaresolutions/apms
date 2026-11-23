from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.models.branch import Branch
from app.models.iam import Tenant
from app.modules.branches.schemas import BranchCreate
from app.modules.branches.service import create_branch
from app.modules.departments.schemas import DepartmentCreate
from app.modules.departments.service import create_department
from app.modules.employees.schemas import EmployeeCreate, EmployeeUpdate
from app.modules.employees.service import (
    create_employee,
    get_employee,
    list_employees,
    update_employee,
)


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_employee_crypto_round_trip(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that sensitive PII fields are never stored in plaintext in the DB and API returns masked PII."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)

        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None, "Branch missing"

        raw_pan = "ABCDE1234F"
        raw_aadhaar = "123456781234"
        raw_bank = "9876543210"
        raw_ifsc = "SBIN0001234"
        emp_code = f"EMP-{uuid4().hex[:6].upper()}"

        payload = EmployeeCreate(
            employee_code=emp_code,
            full_name="Vault Test Employee",
            branch_id=branch.id,
            date_of_joining=date(2026, 1, 1),
            pan=raw_pan,
            aadhaar=raw_aadhaar,
            bank_account=raw_bank,
            bank_ifsc=raw_ifsc,
            biometric_consent=True,
        )

        created = await create_employee(session, tenant.id, payload)

        # 1. API Output verification: must return masked PII
        assert created.pan_masked == "XXXXX1234"
        assert created.aadhaar_masked == "XXXXXXXX1234"
        assert created.bank_account_masked == "XXXXXX3210"
        assert created.bank_ifsc_masked == "XXXXXXX1234"
        assert created.biometric_consent_at is not None

        # 2. Database verification: raw values in Postgres must be ciphertexts, never plaintext
        row = (
            await session.execute(
                text(
                    "SELECT pan_encrypted, aadhaar_encrypted, bank_account_encrypted, bank_ifsc_encrypted "
                    "FROM employees WHERE id = :id"
                ),
                {"id": created.id},
            )
        ).mappings().one()

        assert row["pan_encrypted"] != raw_pan
        assert raw_pan not in row["pan_encrypted"]
        assert row["pan_encrypted"].startswith("v1:")

        assert row["aadhaar_encrypted"] != raw_aadhaar
        assert raw_aadhaar not in row["aadhaar_encrypted"]
        assert row["aadhaar_encrypted"].startswith("v1:")

        assert row["bank_account_encrypted"] != raw_bank
        assert raw_bank not in row["bank_account_encrypted"]

        assert row["bank_ifsc_encrypted"] != raw_ifsc
        assert raw_ifsc not in row["bank_ifsc_encrypted"]


@pytest.mark.asyncio
async def test_negative_rls_cross_tenant_isolation(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that Tenant A cannot query, update, or delete Tenant B's employees under RLS."""
    tenant_a, tenant_b = seeded_tenants

    # Step 1: Create an employee in Tenant A
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        branch_a = await session_a.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch_a

        emp_a = await create_employee(
            session_a,
            tenant_a.id,
            EmployeeCreate(
                employee_code=f"EMP-A-{uuid4().hex[:6].upper()}",
                full_name="Tenant A Secret Employee",
                branch_id=branch_a.id,
                date_of_joining=date(2026, 1, 1),
                pan="ABCDE9999F",
            ),
        )
        await session_a.commit()

    # Step 2: In a separate session under Tenant B, verify complete isolation
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)

        # 1. Service GET must fail with 404
        with pytest.raises(ProblemError) as exc_info:
            await get_employee(session_b, tenant_b.id, emp_a.id)
        assert exc_info.value.status == 404

        # 2. Service LIST must not include Tenant A's employee
        tenant_b_employees = await list_employees(session_b, tenant_b.id)
        assert all(e.id != emp_a.id for e in tenant_b_employees)

        # 3. Direct SQL SELECT under Tenant B RLS returns 0 rows
        direct_select = await session_b.execute(
            text("SELECT * FROM employees WHERE id = :id"),
            {"id": emp_a.id},
        )
        assert direct_select.first() is None

        # 4. Direct SQL UPDATE under Tenant B RLS updates 0 rows
        direct_update = await session_b.execute(
            text("UPDATE employees SET full_name = 'Hacked' WHERE id = :id"),
            {"id": emp_a.id},
        )
        assert direct_update.rowcount == 0

        # 5. Direct SQL DELETE under Tenant B RLS deletes 0 rows
        direct_delete = await session_b.execute(
            text("DELETE FROM employees WHERE id = :id"),
            {"id": emp_a.id},
        )
        assert direct_delete.rowcount == 0

    # Step 3: Switch back to Tenant A to verify record was completely untouched
    async with SessionLocal() as session_a2:
        await set_tenant(session_a2, tenant_a.id)
        emp_check = await get_employee(session_a2, tenant_a.id, emp_a.id)
        assert emp_check.full_name == "Tenant A Secret Employee"


@pytest.mark.asyncio
async def test_dpdp_biometric_consent_and_withdrawal(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify DPDP Act 2023 biometric consent tracking and withdrawal."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch

        # 1. Create with consent
        emp = await create_employee(
            session,
            tenant.id,
            EmployeeCreate(
                employee_code=f"EMP-CONSENT-{uuid4().hex[:6].upper()}",
                full_name="Consent Employee",
                branch_id=branch.id,
                date_of_joining=date(2026, 1, 1),
                biometric_consent=True,
            ),
        )
        assert emp.biometric_consent_at is not None

        # 2. Withdraw consent
        updated = await update_employee(
            session,
            tenant.id,
            emp.id,
            EmployeeUpdate(biometric_consent=False),
        )
        assert updated.biometric_consent_at is None


@pytest.mark.asyncio
async def test_composite_foreign_key_cross_tenant_branch_rejected(
    seeded_tenants: tuple[Tenant, Tenant],
) -> None:
    """Verify that referencing another tenant's branch is prevented."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)
        branch_b = await session_b.scalar(select(Branch).where(Branch.tenant_id == tenant_b.id))
        assert branch_b

    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        # Attempt to create employee in Tenant A with branch from Tenant B
        with pytest.raises(ProblemError) as exc_info:
            await create_employee(
                session_a,
                tenant_a.id,
                EmployeeCreate(
                    employee_code=f"EMP-CROSS-{uuid4().hex[:6].upper()}",
                    full_name="Cross Branch Employee",
                    branch_id=branch_b.id,
                    date_of_joining=date(2026, 1, 1),
                ),
            )
        assert exc_info.value.status == 400


@pytest.mark.asyncio
async def test_department_must_belong_to_employee_branch(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant, _ = seeded_tenants
    suffix = uuid4().hex[:6].upper()

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch_a = await create_branch(session, tenant.id, BranchCreate(name=f"Mill A {suffix}", code=f"A{suffix[:4]}"))
        branch_b = await create_branch(session, tenant.id, BranchCreate(name=f"Mill B {suffix}", code=f"B{suffix[:4]}"))
        other_dept = await create_department(
            session,
            tenant.id,
            DepartmentCreate(branch_id=branch_b.id, name=f"Other {suffix}", code=f"O{suffix[:4]}"),
        )
        same_dept = await create_department(
            session,
            tenant.id,
            DepartmentCreate(branch_id=branch_a.id, name=f"Same {suffix}", code=f"S{suffix[:4]}"),
        )

        with pytest.raises(ProblemError) as exc_info:
            await create_employee(
                session,
                tenant.id,
                EmployeeCreate(
                    employee_code=f"EMP-XBRANCH-{suffix}",
                    full_name="Cross Branch Department",
                    branch_id=branch_a.id,
                    department_id=other_dept.id,
                    date_of_joining=date(2026, 1, 1),
                ),
            )
        assert exc_info.value.status == 400

        created = await create_employee(
            session,
            tenant.id,
            EmployeeCreate(
                employee_code=f"EMP-SAME-{suffix}",
                full_name="Same Branch Department",
                branch_id=branch_a.id,
                department_id=same_dept.id,
                date_of_joining=date(2026, 1, 1),
            ),
        )
        cleared = await update_employee(
            session,
            tenant.id,
            created.id,
            EmployeeUpdate(department_id=None),
        )
        assert cleared.department_id is None

from datetime import date
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.models.department import Department
from app.models.designation import Designation
from app.models.iam import Tenant
from app.modules.designations.schemas import DesignationCreate, DesignationUpdate
from app.modules.designations.service import (
    create_designation,
    delete_designation,
    list_designations,
    update_designation,
)
from app.modules.employees.schemas import EmployeeCreate, EmployeeUpdate
from app.modules.employees.service import create_employee, delete_employee, get_employee, update_employee


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_designation_negative_rls(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that Tenant B cannot query, update, or delete Tenant A's designations under RLS."""
    tenant_a, tenant_b = seeded_tenants

    # Step 1: Create a department and designation in Tenant A
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        dept_a = await session_a.scalar(select(Department).where(Department.tenant_id == tenant_a.id))
        assert dept_a

        code_a = f"OPR-{uuid4().hex[:4].upper()}"
        desig_a = await create_designation(
            session_a,
            tenant_a.id,
            DesignationCreate(
                department_id=dept_a.id,
                name=f"Secret Operator {code_a}",
                code=code_a,
            ),
        )
        await session_a.commit()

    # Step 2: Under Tenant B session context, verify isolation
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)

        # 1. Direct SQL select under Tenant B returns 0 rows
        direct_select = await session_b.execute(
            text("SELECT id, name FROM designations WHERE id = :id"),
            {"id": desig_a.id},
        )
        assert direct_select.fetchall() == []

        # 2. Service list returns none of Tenant A's designations
        b_list = await list_designations(session_b, tenant_b.id)
        assert not any(d.id == desig_a.id for d in b_list)

        # 3. Update fails with 404
        with pytest.raises(ProblemError) as exc_update:
            await update_designation(
                session_b,
                tenant_b.id,
                desig_a.id,
                DesignationUpdate(name="Hacked Name"),
            )
        assert exc_update.value.status == 404

        # 4. Delete fails with 404
        with pytest.raises(ProblemError) as exc_del:
            await delete_designation(session_b, tenant_b.id, desig_a.id)
        assert exc_del.value.status == 404


@pytest.mark.asyncio
async def test_designation_department_scoping_and_uniqueness(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify department validation and code/name uniqueness per department."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        depts = list((await session.scalars(select(Department).where(Department.tenant_id == tenant_a.id))).all())
        assert len(depts) >= 2, "North Mill must have at least 2 departments for test"
        dept_1, dept_2 = depts[0], depts[1]

        code = f"DES-{uuid4().hex[:4].upper()}"
        name = f"Specialist {code}"

        # 1. Non-existent department fails with 400
        with pytest.raises(ProblemError) as exc_bad_dept:
            await create_designation(
                session,
                tenant_a.id,
                DesignationCreate(department_id=uuid4(), name=name, code=code),
            )
        assert exc_bad_dept.value.status == 400

        # 2. Creation in dept_1 succeeds
        created_1 = await create_designation(
            session,
            tenant_a.id,
            DesignationCreate(department_id=dept_1.id, name=name, code=code),
        )
        assert created_1.code == code
        assert created_1.department_id == dept_1.id

        # 3. Duplicate code in SAME department fails with 409
        with pytest.raises(ProblemError) as exc_dup_code:
            await create_designation(
                session,
                tenant_a.id,
                DesignationCreate(department_id=dept_1.id, name="Different Name", code=code),
            )
        assert exc_dup_code.value.status == 409

        # 4. Duplicate name in SAME department fails with 409
        with pytest.raises(ProblemError) as exc_dup_name:
            await create_designation(
                session,
                tenant_a.id,
                DesignationCreate(department_id=dept_1.id, name=name.lower(), code=f"OTHER-{uuid4().hex[:4].upper()}"),
            )
        assert exc_dup_name.value.status == 409

        # 5. Same code in a DIFFERENT department succeeds
        created_2 = await create_designation(
            session,
            tenant_a.id,
            DesignationCreate(department_id=dept_2.id, name=f"Dept 2 {name}", code=code),
        )
        assert created_2.code == code
        assert created_2.department_id == dept_2.id


@pytest.mark.asyncio
async def test_designation_employee_linkage_and_cross_validation(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify employee linkage, cross-department validation, and deletion protection."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        depts = list((await session.scalars(select(Department).where(Department.tenant_id == tenant_a.id))).all())
        assert len(depts) >= 2
        dept_1, dept_2 = depts[0], depts[1]

        # Create designation in dept_1
        code_1 = f"DES-{uuid4().hex[:4].upper()}"
        desig_1 = await create_designation(
            session,
            tenant_a.id,
            DesignationCreate(department_id=dept_1.id, name=f"Role {code_1}", code=code_1),
        )

        emp_code = f"EMP-{uuid4().hex[:6].upper()}"

        # 1. Attempting to assign desig_1 (dept_1) to employee in dept_2 fails with 400
        with pytest.raises(ProblemError) as exc_mismatch:
            await create_employee(
                session,
                tenant_a.id,
                EmployeeCreate(
                    employee_code=emp_code,
                    full_name="Test Person",
                    branch_id=dept_2.branch_id,
                    department_id=dept_2.id,
                    designation_id=desig_1.id,
                    date_of_joining=date(2025, 1, 1),
                ),
            )
        assert exc_mismatch.value.status == 400

        # 2. Creating employee in dept_1 with desig_1 succeeds
        emp = await create_employee(
            session,
            tenant_a.id,
            EmployeeCreate(
                employee_code=emp_code,
                full_name="Test Person",
                branch_id=dept_1.branch_id,
                department_id=dept_1.id,
                designation_id=desig_1.id,
                date_of_joining=date(2025, 1, 1),
            ),
        )
        assert emp.designation_id == desig_1.id
        assert emp.designation == desig_1.name

        renamed = await update_designation(
            session,
            tenant_a.id,
            desig_1.id,
            DesignationUpdate(name=f"Renamed {code_1}"),
        )
        linked = await get_employee(session, tenant_a.id, emp.id)
        assert linked.designation == renamed.name

        same_branch = [dept for dept in depts if dept.branch_id == dept_1.branch_id and dept.id != dept_1.id]
        if same_branch:
            with pytest.raises(ProblemError) as exc_move:
                await update_employee(
                    session,
                    tenant_a.id,
                    emp.id,
                    EmployeeUpdate(department_id=same_branch[0].id),
                )
            assert exc_move.value.status == 400

        # 3. Deleting designation while assigned to employee fails with 409
        with pytest.raises(ProblemError) as exc_del_busy:
            await delete_designation(session, tenant_a.id, desig_1.id)
        assert exc_del_busy.value.status == 409

        # 4. Updating employee to clear designation_id allows deleting designation
        cleared = await update_employee(
            session,
            tenant_a.id,
            emp.id,
            EmployeeUpdate(designation_id=None),
        )
        assert cleared.designation_id is None
        assert cleared.designation is None
        await delete_designation(session, tenant_a.id, desig_1.id)

        # Clean up test employee
        await delete_employee(session, tenant_a.id, emp.id)


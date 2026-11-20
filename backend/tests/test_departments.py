from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select, text

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.main import app
from app.models.branch import Branch
from app.models.department import Department
from app.models.iam import Tenant
from app.schemas.iam import DepartmentCreate, DepartmentUpdate
from app.services.directory import (
    create_department,
    delete_department,
    list_departments,
    update_department,
)


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_department_negative_rls(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that Tenant B cannot query, update, or delete Tenant A's departments under RLS."""
    tenant_a, tenant_b = seeded_tenants

    # Step 1: Create a department in Tenant A
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        branch_a = await session_a.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch_a

        dept_code = f"DP-A-{uuid4().hex[:4].upper()}"
        dept_a = await create_department(
            session_a,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch_a.id,
                name="Tenant A Secret Dept",
                code=dept_code,
            ),
        )
        await session_a.commit()

    # Step 2: Under Tenant B session context, verify complete isolation
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)

        # 1. Direct SQL SELECT under Tenant B RLS returns 0 rows
        direct_select = await session_b.execute(
            text("SELECT * FROM departments WHERE id = :id"),
            {"id": dept_a.id},
        )
        assert direct_select.first() is None

        # 2. Direct SQL UPDATE under Tenant B RLS updates 0 rows
        direct_update = await session_b.execute(
            text("UPDATE departments SET name = 'Hacked' WHERE id = :id"),
            {"id": dept_a.id},
        )
        assert direct_update.rowcount == 0

        # 3. Direct SQL DELETE under Tenant B RLS deletes 0 rows
        direct_delete = await session_b.execute(
            text("DELETE FROM departments WHERE id = :id"),
            {"id": dept_a.id},
        )
        assert direct_delete.rowcount == 0

        # 4. Service list does not include Tenant A's department
        b_departments = await list_departments(session_b, tenant_b.id)
        assert all(d.id != dept_a.id for d in b_departments)

        # 5. Service update/delete on Tenant A ID fails with 404
        with pytest.raises(ProblemError) as exc_update:
            await update_department(session_b, tenant_b.id, dept_a.id, DepartmentUpdate(name="Hacked"))
        assert exc_update.value.status == 404

        with pytest.raises(ProblemError) as exc_delete:
            await delete_department(session_b, tenant_b.id, dept_a.id)
        assert exc_delete.value.status == 404

    # Step 3: Re-read Tenant A row as Tenant A to confirm isolation and immutability
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        row = await session_a.get(Department, dept_a.id)
        assert row is not None
        assert row.name == "Tenant A Secret Dept"


@pytest.mark.asyncio
async def test_department_composite_foreign_key_cross_tenant_branch_rejected(
    seeded_tenants: tuple[Tenant, Tenant],
) -> None:
    """Verify that referencing another tenant's branch is rejected."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)
        branch_b = await session_b.scalar(select(Branch).where(Branch.tenant_id == tenant_b.id))
        assert branch_b

    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        # Attempt to create department in Tenant A referencing Tenant B branch
        with pytest.raises(ProblemError) as exc_info:
            await create_department(
                session_a,
                tenant_a.id,
                DepartmentCreate(
                    branch_id=branch_b.id,
                    name="Cross Branch Dept",
                    code=f"CB-{uuid4().hex[:4].upper()}",
                ),
            )
        assert exc_info.value.status == 400


@pytest.mark.asyncio
async def test_department_self_referential_hierarchy(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify self-referential sub-departments (parent_dept_id) and loop prevention."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        branch_a = await session_a.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch_a

        # 1. Create parent department
        parent_code = f"P-{uuid4().hex[:4].upper()}"
        parent = await create_department(
            session_a,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch_a.id,
                name="Parent Division",
                code=parent_code,
            ),
        )

        # 2. Create child department linked to parent
        child_code = f"C-{uuid4().hex[:4].upper()}"
        child = await create_department(
            session_a,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch_a.id,
                name="Child Unit",
                code=child_code,
                parent_dept_id=parent.id,
            ),
        )
        assert child.parent_dept_id == parent.id

        # 3. Department cannot be its own parent
        with pytest.raises(ProblemError) as exc_loop:
            await update_department(
                session_a,
                tenant_a.id,
                parent.id,
                DepartmentUpdate(parent_dept_id=parent.id),
            )
        assert exc_loop.value.status == 400


@pytest.mark.asyncio
async def test_department_api_crud_and_idempotency() -> None:
    """Test full HTTP API CRUD flow and idempotency replay."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as North Mill admin
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Fetch branches
        branches_resp = await client.get("/api/v1/branches", headers=headers)
        assert branches_resp.status_code == 200
        branch_id = branches_resp.json()[0]["id"]

        # 3. Create department with idempotency key
        dept_code = f"API-{uuid4().hex[:4].upper()}"
        idempotency_key = str(uuid4())
        payload = {
            "branch_id": branch_id,
            "name": "Quality Assurance",
            "code": dept_code,
        }
        create_resp = await client.post(
            "/api/v1/departments",
            headers={**headers, "Idempotency-Key": idempotency_key},
            json=payload,
        )
        assert create_resp.status_code == 201
        dept_data = create_resp.json()
        dept_id = dept_data["id"]
        assert dept_data["code"] == dept_code

        # 4. Idempotency replay check
        replay_resp = await client.post(
            "/api/v1/departments",
            headers={**headers, "Idempotency-Key": idempotency_key},
            json=payload,
        )
        assert replay_resp.status_code == 201
        assert replay_resp.json()["id"] == dept_id

        # 5. List with branch filter
        list_resp = await client.get(
            f"/api/v1/departments?branch_id={branch_id}",
            headers=headers,
        )
        assert list_resp.status_code == 200
        assert any(d["id"] == dept_id for d in list_resp.json())

        # 6. Update department
        update_resp = await client.patch(
            f"/api/v1/departments/{dept_id}",
            headers=headers,
            json={"name": "QA & Metrology", "is_active": False},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "QA & Metrology"
        assert update_resp.json()["is_active"] is False

        # 7. Delete department
        delete_resp = await client.delete(
            f"/api/v1/departments/{dept_id}",
            headers=headers,
        )
        assert delete_resp.status_code == 200
        assert delete_resp.json()["id"] == dept_id


@pytest.mark.asyncio
async def test_delete_department_with_children_rejected_409(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that deleting a parent department with sub-departments raises 409."""
    tenant_a, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch

        parent = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch.id,
                name="Parent Division Ops",
                code=f"POP-{uuid4().hex[:4].upper()}",
            ),
        )
        await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch.id,
                name="Child Unit Ops",
                code=f"COP-{uuid4().hex[:4].upper()}",
                parent_dept_id=parent.id,
            ),
        )
        await session.commit()

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        with pytest.raises(ProblemError) as exc_info:
            await delete_department(session, tenant_a.id, parent.id)
        assert exc_info.value.status == 409
        assert "sub-departments" in exc_info.value.title.lower() or "sub-departments" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_department_two_node_cycle_rejected_400(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that creating a two-node cycle in the department hierarchy raises 400."""
    tenant_a, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch

        dept_1 = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch.id,
                name="Cycle Dept 1",
                code=f"CY1-{uuid4().hex[:4].upper()}",
            ),
        )
        dept_2 = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch.id,
                name="Cycle Dept 2",
                code=f"CY2-{uuid4().hex[:4].upper()}",
                parent_dept_id=dept_1.id,
            ),
        )
        await session.commit()

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        # Attempt to set dept_2 as parent of dept_1 (creates 2-node cycle: dept_1 -> dept_2 -> dept_1)
        with pytest.raises(ProblemError) as exc_info:
            await update_department(
                session,
                tenant_a.id,
                dept_1.id,
                DepartmentUpdate(parent_dept_id=dept_2.id),
            )
        assert exc_info.value.status == 400
        assert "cyclic" in exc_info.value.title.lower() or "descendant" in exc_info.value.detail.lower()


@pytest.mark.asyncio
async def test_department_parent_in_other_branch_rejected_400(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify that referencing a parent department in a different branch is rejected with 400."""
    tenant_a, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        b1 = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert b1
        from app.schemas.iam import BranchCreate
        from app.services.directory import create_branch

        b2 = await create_branch(
            session,
            tenant_a.id,
            BranchCreate(
                name="South Gate Branch",
                code=f"SG-{uuid4().hex[:4].upper()}",
            ),
        )

        dept_b1 = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=b1.id,
                name="Branch 1 Dept",
                code=f"B1-{uuid4().hex[:4].upper()}",
            ),
        )

        # 1. Reject create_department if parent is in a different branch
        with pytest.raises(ProblemError) as exc_create:
            await create_department(
                session,
                tenant_a.id,
                DepartmentCreate(
                    branch_id=b2.id,
                    name="Branch 2 Dept",
                    code=f"B2-{uuid4().hex[:4].upper()}",
                    parent_dept_id=dept_b1.id,
                ),
            )
        assert exc_create.value.status == 400

        # Create department in branch 2 without parent
        dept_b2 = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=b2.id,
                name="Branch 2 Dept B",
                code=f"B2B-{uuid4().hex[:4].upper()}",
            ),
        )

        # 2. Reject update_department linking to parent in different branch
        with pytest.raises(ProblemError) as exc_update:
            await update_department(
                session,
                tenant_a.id,
                dept_b2.id,
                DepartmentUpdate(parent_dept_id=dept_b1.id),
            )
        assert exc_update.value.status == 400


@pytest.mark.asyncio
async def test_supervisor_cannot_create_or_delete_department_403() -> None:
    """Verify that supervisor@northmill.example gets 403 on POST and DELETE /departments."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Login as supervisor
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "supervisor@northmill.example", "password": "ChangeMe-Supervisor-1"},
        )
        assert login_resp.status_code == 200
        token = login_resp.json()["access_token"]
        headers = {"Authorization": f"Bearer {token}"}

        # 2. Attempt to create department -> 403 Forbidden
        create_resp = await client.post(
            "/api/v1/departments",
            headers={**headers, "Idempotency-Key": str(uuid4())},
            json={
                "branch_id": str(uuid4()),
                "name": "Unauthorized Dept",
                "code": "UNAUTH",
            },
        )
        assert create_resp.status_code == 403

        # 3. Attempt to delete department -> 403 Forbidden
        delete_resp = await client.delete(
            f"/api/v1/departments/{uuid4()}",
            headers=headers,
        )
        assert delete_resp.status_code == 403


@pytest.mark.asyncio
async def test_clear_parent_department(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    """Verify clearing parent_dept_id by passing null in update."""
    tenant_a, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch

        parent = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch.id,
                name="Clear Parent Root",
                code=f"CPR-{uuid4().hex[:4].upper()}",
            ),
        )
        child = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=branch.id,
                name="Clear Parent Leaf",
                code=f"CPL-{uuid4().hex[:4].upper()}",
                parent_dept_id=parent.id,
            ),
        )
        assert child.parent_dept_id == parent.id

        # Update with parent_dept_id=None (explicit clearing via JSON null)
        cleared = await update_department(
            session,
            tenant_a.id,
            child.id,
            DepartmentUpdate(parent_dept_id=None),
        )
        assert cleared.parent_dept_id is None


@pytest.mark.asyncio
async def test_moving_department_with_children_to_another_branch_rejected_400(
    seeded_tenants: tuple[Tenant, Tenant],
) -> None:
    """Verify that moving a department with sub-departments to another branch is rejected with 400."""
    tenant_a, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        b1 = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert b1
        from app.schemas.iam import BranchCreate
        from app.services.directory import create_branch

        b2 = await create_branch(
            session,
            tenant_a.id,
            BranchCreate(
                name="New West Branch",
                code=f"NWB-{uuid4().hex[:4].upper()}",
            ),
        )

        parent = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=b1.id,
                name="Headquarters Ops",
                code=f"HQ-{uuid4().hex[:4].upper()}",
            ),
        )
        child = await create_department(
            session,
            tenant_a.id,
            DepartmentCreate(
                branch_id=b1.id,
                name="Sub Operations Unit",
                code=f"SOU-{uuid4().hex[:4].upper()}",
                parent_dept_id=parent.id,
            ),
        )
        assert child.parent_dept_id == parent.id

        # Attempt to change parent department's branch to b2 -> should be rejected with 400
        with pytest.raises(ProblemError) as exc_info:
            await update_department(
                session,
                tenant_a.id,
                parent.id,
                DepartmentUpdate(branch_id=b2.id),
            )
        assert exc_info.value.status == 400
        assert "sub-departments" in exc_info.value.title.lower() or "sub-departments" in exc_info.value.detail.lower()



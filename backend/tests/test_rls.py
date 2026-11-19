import pytest
from sqlalchemy import select, text

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.models.branch import Branch
from app.models.iam import Tenant


@pytest.mark.asyncio
async def test_rls_isolation_branches() -> None:
    """Verify that South Mill context cannot select, update, or delete North Mill branches."""
    # 1. Fetch North Mill (tenant_a) and South Mill (tenant_b) using MigrateSession
    async with MigrateSession() as admin_session:
        tenant_a = await admin_session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await admin_session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"

        branch_a = await admin_session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch_a, "North Mill branch must exist"

    # 2. Run under South Mill context with apms_app (no bypass)
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)

        # Assert North Mill branch returns no row on SELECT
        result_select = await session_b.execute(
            text("SELECT * FROM branches WHERE id = :id"),
            {"id": branch_a.id},
        )
        assert result_select.first() is None

        # Assert UPDATE on North Mill branch id affects 0 rows
        result_update = await session_b.execute(
            text("UPDATE branches SET name = 'Hacked' WHERE id = :id"),
            {"id": branch_a.id},
        )
        assert result_update.rowcount == 0

        # Assert DELETE on North Mill branch id affects 0 rows
        result_delete = await session_b.execute(
            text("DELETE FROM branches WHERE id = :id"),
            {"id": branch_a.id},
        )
        assert result_delete.rowcount == 0

    # 3. Verify North Mill branch remains intact under North Mill context
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        unchanged = await session_a.scalar(select(Branch).where(Branch.id == branch_a.id))
        assert unchanged is not None
        assert unchanged.name == branch_a.name

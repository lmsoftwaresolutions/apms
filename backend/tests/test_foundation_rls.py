from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.models.branch import Branch
from app.models.iam import Tenant
from app.models.privacy import ConsentEvent
from app.models.regularization import AttendanceRegularization
from app.models.rollup_failure import AttendanceRollupFailure
from app.modules.employees.schemas import EmployeeCreate
from app.modules.employees.service import create_employee, delete_employee, get_employee
from app.modules.privacy.repository import insert_pii_audit, list_consent_events


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_foundation_tables_are_invisible_across_tenants(seeded_tenants: tuple[Tenant, Tenant]) -> None:
    tenant_a, tenant_b = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None
        created = await create_employee(
            session,
            tenant_a.id,
            EmployeeCreate(
                employee_code=f"EMP-{uuid4().hex[:6].upper()}",
                full_name="Foundation Isolation",
                branch_id=branch.id,
                date_of_joining=date(2026, 1, 1),
                biometric_consent=True,
            ),
            actor_user_id=None,
        )
        await insert_pii_audit(session, tenant_a.id, created.id, uuid4(), "pan")
        session.add(
            AttendanceRegularization(
                id=uuid4(),
                tenant_id=tenant_a.id,
                employee_id=created.id,
                calendar_date=date(2026, 11, 24),
                request_type="MISSED_IN",
                requested_in=datetime(2026, 11, 24, 3, 30, tzinfo=UTC),
                reason="Missed the gate",
                status="PENDING",
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        session.add(
            AttendanceRollupFailure(
                id=uuid4(),
                tenant_id=tenant_a.id,
                employee_id=created.id,
                calendar_date=date(2026, 11, 24),
                error_title="Unscheduled shift evaluation",
                error_detail="No shift",
                created_at=datetime.now(UTC),
            )
        )
        await session.commit()
        employee_id = created.id

    async with SessionLocal() as other:
        await set_tenant(other, tenant_b.id)
        for table in (
            "consent_events",
            "pii_access_audits",
            "attendance_regularizations",
            "attendance_rollup_failures",
        ):
            found = await other.execute(
                text(f"SELECT id FROM {table} WHERE employee_id = :employee_id"),
                {"employee_id": employee_id},
            )
            assert found.first() is None
        assert await list_consent_events(other, tenant_b.id, employee_id) == []

    async with SessionLocal() as own:
        await set_tenant(own, tenant_a.id)
        events = await list_consent_events(own, tenant_a.id, employee_id)
        assert [row.action for row in events] == ["GRANTED"]
        assert isinstance(events[0], ConsentEvent)
        await delete_employee(own, tenant_a.id, employee_id)
        await own.commit()

    async with SessionLocal() as own:
        await set_tenant(own, tenant_a.id)
        kept = await get_employee(own, tenant_a.id, employee_id)
        assert kept.is_active is False

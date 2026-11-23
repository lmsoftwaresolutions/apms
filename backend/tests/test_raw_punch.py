from datetime import UTC, date, datetime
from uuid import uuid4

import pytest
from sqlalchemy import select, text

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.punch import PunchEvent, RawEnvelope
from app.modules.punches.repository import list_punch_events
from app.modules.punches.service import process_and_ingest_punches


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_raw_punch_ingest_and_60s_debounce(seeded_tenants: tuple[Tenant, Tenant]):
    """Test append-only raw envelope and 60-second debounce deduplication (BR-PCH-01)."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None

        emp_code = f"PCH_{uuid4().hex[:6]}"
        emp = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch.id,
            employee_code=emp_code,
            full_name="Dr. Vaibhav Kolhe",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(emp)
        await session.commit()
        await set_tenant(session, tenant_a.id)

        # Ingest first punch
        etime_payload = {
            "Error": False,
            "Msg": "Success",
            "PunchData": [
                {
                    "Name": "DR. VAIBHAV KOLHE",
                    "Empcode": emp_code,
                    "PunchDate": "20/11/2026 09:00:00",
                }
            ],
        }

        res1 = await process_and_ingest_punches(
            session=session,
            tenant_id=tenant_a.id,
            source="ETIMEOFFICE",
            raw_payload=etime_payload,
            device_identifier="device_gate_1",
        )
        await session.commit()

        assert res1.total_received == 1
        assert res1.active_punches == 1
        assert res1.duplicates_ignored == 0

        # Verify RawEnvelope created
        await set_tenant(session, tenant_a.id)
        env = await session.get(RawEnvelope, res1.raw_envelope_id)
        assert env is not None
        assert env.source == "ETIMEOFFICE"
        assert env.device_identifier == "device_gate_1"

        # Ingest second punch within 30 seconds -> Debounce BR-PCH-01!
        await set_tenant(session, tenant_a.id)
        repeat_payload = {
            "Error": False,
            "Msg": "Success",
            "PunchData": [
                {
                    "Name": "DR. VAIBHAV KOLHE",
                    "Empcode": emp_code,
                    "PunchDate": "20/11/2026 09:00:25",  # 25 seconds later
                }
            ],
        }

        res2 = await process_and_ingest_punches(
            session=session,
            tenant_id=tenant_a.id,
            source="ETIMEOFFICE",
            raw_payload=repeat_payload,
            device_identifier="device_gate_1",
        )
        await session.commit()

        assert res2.total_received == 1
        assert res2.active_punches == 0
        assert res2.duplicates_ignored == 1

        # Verify punch event statuses
        await set_tenant(session, tenant_a.id)
        events = list(
            (
                await session.scalars(
                    select(PunchEvent)
                    .where(PunchEvent.tenant_id == tenant_a.id, PunchEvent.employee_id == emp.id)
                    .order_by(PunchEvent.punch_time.asc())
                )
            ).all()
        )
        assert len(events) == 2
        assert events[0].status == "ACTIVE"
        assert events[1].status == "DUPLICATE_IGNORED"


@pytest.mark.asyncio
async def test_punch_negative_rls(seeded_tenants: tuple[Tenant, Tenant]):
    """Verify Tenant A cannot see Tenant B punches under RLS."""
    tenant_a, tenant_b = seeded_tenants
    now = datetime.now(UTC)

    # Insert envelope for Tenant A
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        env_a = RawEnvelope(
            id=uuid4(),
            tenant_id=tenant_a.id,
            source="TEST",
            raw_payload={"test": 1},
            payload_hash=f"hash_a_{uuid4().hex[:8]}",
            received_at=now,
        )
        session_a.add(env_a)
        await session_a.commit()

    # Query from Tenant B session -> must be None / empty!
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)
        found = await session_b.get(RawEnvelope, env_a.id)
        assert found is None


@pytest.mark.asyncio
async def test_raw_envelope_and_trace_immutability(seeded_tenants: tuple[Tenant, Tenant]):
    """Invariant 2 & 4: raw_envelope and attendance_explanation_traces reject UPDATE and DELETE at DB level."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        # 1. Attempting UPDATE on raw_envelope must raise permission denied
        with pytest.raises(Exception) as exc_info:
            await session.execute(
                text("UPDATE raw_envelope SET source = 'TAMPERED' WHERE tenant_id = :tid"),
                {"tid": tenant_a.id},
            )
            await session.commit()
        assert "permission denied" in str(exc_info.value).lower()
        await session.rollback()

        # 2. Attempting DELETE on attendance_explanation_traces must raise permission denied
        with pytest.raises(Exception) as exc_info:
            await session.execute(
                text("DELETE FROM attendance_explanation_traces WHERE tenant_id = :tid"),
                {"tid": tenant_a.id},
            )
            await session.commit()
        assert "permission denied" in str(exc_info.value).lower()
        await session.rollback()


@pytest.mark.asyncio
async def test_inactive_employee_punch_and_clock_drift(seeded_tenants: tuple[Tenant, Tenant]):
    """Verify inactive employee is skipped (BUG-05) and clock drift warning is recorded (ENH-02)."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None

        active_code = f"ACT_{uuid4().hex[:6]}"
        inactive_code = f"INACT_{uuid4().hex[:6]}"

        active_emp_id = uuid4()
        # Seed 1 active employee and 1 inactive employee
        session.add(
            Employee(
                id=active_emp_id,
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=active_code,
                full_name="Active Person",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        session.add(
            Employee(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=inactive_code,
                full_name="Inactive Person",
                date_of_joining=date(2026, 1, 1),
                is_active=False,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await session.commit()
        await set_tenant(session, tenant_a.id)

        # Ingest payload containing both employees
        payload = {
            "PunchData": [
                {
                    "Empcode": active_code,
                    "PunchDate": "20/11/2026 09:00:00",  # Clock drift > 300s relative to now
                },
                {
                    "Empcode": inactive_code,
                    "PunchDate": "20/11/2026 09:00:00",
                },
            ]
        }

        res = await process_and_ingest_punches(
            session=session,
            tenant_id=tenant_a.id,
            source="ETIMEOFFICE",
            raw_payload=payload,
        )
        await session.commit()
        await set_tenant(session, tenant_a.id)

        # BUG-05: Inactive employee must be in unmatched_employees
        assert inactive_code in res.unmatched_employees
        assert res.active_punches == 1

        # ENH-02: Check clock drift warning on active employee's punch
        events = list(await list_punch_events(session, tenant_a.id, employee_id=active_emp_id))
        assert len(events) >= 1
        active_event = events[0]
        assert active_event.location_meta is not None
        assert active_event.location_meta.get("clock_drift_warning") is True


@pytest.mark.asyncio
async def test_raw_payload_bytes_ingest(seeded_tenants: tuple[Tenant, Tenant]):
    """IMP-08: Ingest raw punch payload provided as bytes (e.g. ZKTeco or binary streams)."""
    tenant_a, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None

        emp_code = f"BYT_{uuid4().hex[:6]}"
        session.add(
            Employee(
                id=uuid4(),
                tenant_id=tenant_a.id,
                branch_id=branch.id,
                employee_code=emp_code,
                full_name="Bytes Employee",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await session.commit()
        await set_tenant(session, tenant_a.id)

        raw_csv_bytes = f"employee_code,punch_time,direction\n{emp_code},20/11/2026 09:00:00,IN\n".encode("utf-8")
        res = await process_and_ingest_punches(
            session=session,
            tenant_id=tenant_a.id,
            source="CSV_BULK",
            raw_payload=raw_csv_bytes,
        )
        await session.commit()

        assert res.total_received == 1
        assert res.active_punches == 1

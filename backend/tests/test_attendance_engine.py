from datetime import UTC, date, datetime, time
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.punch import PunchEvent, RawEnvelope
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.service import calculate_and_save_daily_attendance


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_standard_9h_fixed_shift_attendance(seeded_tenants: tuple[Tenant, Tenant]):
    """Golden Vector 1: Standard fixed 9h day (09:00 - 18:00) with full presence -> PRESENT."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None

        emp_id = uuid4()
        session.add(
            Employee(
                id=emp_id,
                tenant_id=tenant.id,
                branch_id=branch.id,
                employee_code=f"STD_{uuid4().hex[:6]}",
                full_name="Standard Employee",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        env_id = uuid4()
        session.add(
            RawEnvelope(
                id=env_id,
                tenant_id=tenant.id,
                source="TEST",
                raw_payload={},
                payload_hash=f"hash_std_{uuid4().hex[:8]}",
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        cal_date = date(2026, 11, 20)
        # Punches in IST: 09:00:00 In -> 03:30:00 UTC, 18:00:00 Out -> 12:30:00 UTC
        p_in = datetime(2026, 11, 20, 3, 30, 0, tzinfo=UTC)
        p_out = datetime(2026, 11, 20, 12, 30, 0, tzinfo=UTC)

        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=p_in,
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=p_out,
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        await session.commit()

        # Re-set tenant after commit for service call
        await set_tenant(session, tenant.id)

        shift = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="FIXED",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(9, 0),
                    end_time=time(18, 0),
                    pre_window_minutes=60,
                    post_window_minutes=120,
                    min_presence_ratio=0.50,
                    break_duration_minutes=0,
                )
            ],
        )

        record, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
            shift_contract=shift,
        )
        await session.commit()

        assert record.status == "PRESENT"
        assert record.worked_duration_minutes == 540
        assert record.scheduled_duration_minutes == 540
        assert float(record.worked_ratio) == 1.0
        assert record.is_single_punch is False
        assert trace.trace_payload["summary"]["assigned_status"] == "PRESENT"


@pytest.mark.asyncio
async def test_n65_split_shift_gap_exclusion_and_n66b_cap(seeded_tenants: tuple[Tenant, Tenant]):
    """Golden Vector 2 & 3:
    - N65: Mid-session gap (12:00 - 16:00, 4h) strictly excluded from worked hours & OT.
    - N66b: If second session is missed, status is capped at HALF_DAY.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None

        emp_full = uuid4()
        emp_missed = uuid4()
        for eid, code in [(emp_full, f"SPLIT_F_{uuid4().hex[:4]}"), (emp_missed, f"SPLIT_M_{uuid4().hex[:4]}")]:
            session.add(
                Employee(
                    id=eid,
                    tenant_id=tenant.id,
                    branch_id=branch.id,
                    employee_code=code,
                    full_name=f"Employee {code}",
                    date_of_joining=date(2026, 1, 1),
                    is_active=True,
                    created_at=datetime.now(UTC),
                    updated_at=datetime.now(UTC),
                )
            )

        env_id = uuid4()
        session.add(
            RawEnvelope(
                id=env_id,
                tenant_id=tenant.id,
                source="TEST",
                raw_payload={},
                payload_hash=f"hash_split_{uuid4().hex[:8]}",
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        cal_date = date(2026, 11, 20)
        # Session 1: 08:00 - 12:00 IST (02:30 - 06:30 UTC)
        # Session 2: 16:00 - 20:00 IST (10:30 - 14:30 UTC)
        # Mid-Gap: 12:00 - 16:00 IST (4h = 240 mins)
        s1_in = datetime(2026, 11, 20, 2, 30, 0, tzinfo=UTC)
        s1_out = datetime(2026, 11, 20, 6, 30, 0, tzinfo=UTC)
        s2_in = datetime(2026, 11, 20, 10, 30, 0, tzinfo=UTC)
        s2_out = datetime(2026, 11, 20, 14, 30, 0, tzinfo=UTC)

        # emp_full punches all 4 boundaries
        for pt in [s1_in, s1_out, s2_in, s2_out]:
            session.add(
                PunchEvent(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    raw_envelope_id=env_id,
                    employee_id=emp_full,
                    punch_time=pt,
                    source="TEST",
                    status="ACTIVE",
                    created_at=datetime.now(UTC),
                )
            )

        # emp_missed only punches Session 1 (Session 2 completely absent)
        for pt in [s1_in, s1_out]:
            session.add(
                PunchEvent(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    raw_envelope_id=env_id,
                    employee_id=emp_missed,
                    punch_time=pt,
                    source="TEST",
                    status="ACTIVE",
                    created_at=datetime.now(UTC),
                )
            )

        await session.commit()

        # Re-set tenant after commit
        await set_tenant(session, tenant.id)

        split_shift = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="SPLIT",
            sessions=[
                SessionWindow(
                    session_order=1,
                    name="Morning Session",
                    start_time=time(8, 0),
                    end_time=time(12, 0),
                    pre_window_minutes=60,
                    post_window_minutes=60,
                    min_presence_ratio=0.50,
                ),
                SessionWindow(
                    session_order=2,
                    name="Evening Session",
                    start_time=time(16, 0),
                    end_time=time(20, 0),
                    pre_window_minutes=60,
                    post_window_minutes=60,
                    min_presence_ratio=0.50,
                ),
            ],
        )

        # 1. Evaluate emp_full
        rec_full, trace_full = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_full,
            calendar_date=cal_date,
            shift_contract=split_shift,
        )

        # N65 Assertion: Total Worked is 240 + 240 = 480 mins.
        # The 240-min gap between 12:00 and 16:00 is strictly excluded!
        assert rec_full.worked_duration_minutes == 480
        assert rec_full.scheduled_duration_minutes == 480
        assert rec_full.status == "PRESENT"
        assert trace_full.trace_payload["summary"]["mid_gap_minutes_excluded"] == 240

        # 2. Evaluate emp_missed (with theta_present=0.50 to verify N66b cap downgrades tentative PRESENT)
        rec_missed, trace_missed = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_missed,
            calendar_date=cal_date,
            shift_contract=split_shift,
            theta_present=0.50,
        )

        # N66b Assertion: Worked Session 1 (240m), missed Session 2 (0m) -> capped at HALF_DAY
        assert rec_missed.worked_duration_minutes == 240
        assert rec_missed.status == "HALF_DAY"
        assert "Capped at HALF_DAY" in trace_missed.trace_payload["summary"]["explanation"]


@pytest.mark.asyncio
async def test_q4_lone_punch_anomaly(seeded_tenants: tuple[Tenant, Tenant]):
    """Golden Vector 4: Only 1 punch recorded -> NEEDS_REVIEW with LONE_PUNCH_ANOMALY and 0 overtime."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None

        emp_id = uuid4()
        session.add(
            Employee(
                id=emp_id,
                tenant_id=tenant.id,
                branch_id=branch.id,
                employee_code=f"LONE_{uuid4().hex[:6]}",
                full_name="Lone Puncher",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        env_id = uuid4()
        session.add(
            RawEnvelope(
                id=env_id,
                tenant_id=tenant.id,
                source="TEST",
                raw_payload={},
                payload_hash=f"hash_lone_{uuid4().hex[:8]}",
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        cal_date = date(2026, 11, 20)
        # Only 1 punch at 09:00 IST (03:30 UTC)
        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=datetime(2026, 11, 20, 3, 30, 0, tzinfo=UTC),
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        await session.commit()

        # Re-set tenant after commit
        await set_tenant(session, tenant.id)

        record, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
        )
        await session.commit()

        # Q4 Assertions
        assert record.status == "NEEDS_REVIEW"
        assert record.is_single_punch is True
        assert record.anomaly_code == "LONE_PUNCH_ANOMALY"
        assert record.overtime_minutes == 0  # BR-ATT-16: Never grant OT on lone punch
        assert trace.trace_payload["summary"]["assigned_status"] == "NEEDS_REVIEW"


@pytest.mark.asyncio
async def test_full_trace_schema_and_append_only(seeded_tenants: tuple[Tenant, Tenant]):
    """IMP-02 & DESIGN-02: Verify full audit trace JSON schema and append-only recalculation."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None

        emp_id = uuid4()
        session.add(
            Employee(
                id=emp_id,
                tenant_id=tenant.id,
                branch_id=branch.id,
                employee_code=f"TRC_{uuid4().hex[:6]}",
                full_name="Trace Auditor",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await session.commit()

        cal_date = date(2026, 11, 20)

        # First calculation (no punches -> ABSENT)
        await set_tenant(session, tenant.id)
        rec1, trace1 = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
        )
        await session.commit()

        # Schema assertions on trace1
        payload = trace1.trace_payload
        for k in ["engine_version", "evaluated_at", "calendar_date", "policy_bands", "sessions", "summary"]:
            assert k in payload

        for s in payload["sessions"]:
            for sk in ["session_order", "session_name", "scheduled_start", "scheduled_end", "window_start", "window_end", "session_eligibility"]:
                assert sk in s

        # Second calculation (recalculate -> must append new trace, not delete old one)
        await set_tenant(session, tenant.id)
        rec2, trace2 = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
        )
        await session.commit()

        assert trace2.id != trace1.id
        assert rec2.id == rec1.id  # Same daily record updated, new trace appended


@pytest.mark.asyncio
async def test_overnight_shift_attribution(seeded_tenants: tuple[Tenant, Tenant]):
    """IMP-03: Overnight shift (22:00 - 06:00 next day) correctly attributed to shift start date."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None

        emp_id = uuid4()
        session.add(
            Employee(
                id=emp_id,
                tenant_id=tenant.id,
                branch_id=branch.id,
                employee_code=f"NIGHT_{uuid4().hex[:6]}",
                full_name="Night Shift Worker",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )

        env_id = uuid4()
        session.add(
            RawEnvelope(
                id=env_id,
                tenant_id=tenant.id,
                source="TEST",
                raw_payload={},
                payload_hash=f"hash_night_{uuid4().hex[:8]}",
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        shift_date = date(2026, 11, 20)
        # Shift: 22:00 IST (16:30 UTC on 20th) to 06:00 IST next day (00:30 UTC on 21st)
        p_in = datetime(2026, 11, 20, 16, 30, 0, tzinfo=UTC)
        p_out = datetime(2026, 11, 21, 0, 30, 0, tzinfo=UTC)

        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=p_in,
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=p_out,
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        await session.commit()

        await set_tenant(session, tenant.id)

        overnight_shift = ShiftInstanceContract(
            calendar_date=shift_date,
            shift_type="OVERNIGHT",
            sessions=[
                SessionWindow(
                    session_order=1,
                    name="Graveyard Shift",
                    start_time=time(22, 0),
                    end_time=time(6, 0),
                    is_overnight=True,
                    pre_window_minutes=60,
                    post_window_minutes=60,
                    min_presence_ratio=0.50,
                )
            ],
        )

        record, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=shift_date,
            shift_contract=overnight_shift,
        )
        await session.commit()

        assert record.calendar_date == shift_date
        assert record.worked_duration_minutes == 480
        assert record.scheduled_duration_minutes == 480
        assert record.status == "PRESENT"
        assert record.is_single_punch is False


@pytest.mark.asyncio
async def test_employer_cancelled_session_credit(seeded_tenants: tuple[Tenant, Tenant]):
    """IMP-04: Employer-cancelled session credited as PRESENT per N66d / ROS-10."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant.id))
        assert branch is not None

        emp_id = uuid4()
        session.add(
            Employee(
                id=emp_id,
                tenant_id=tenant.id,
                branch_id=branch.id,
                employee_code=f"CAN_{uuid4().hex[:6]}",
                full_name="Cancelled Session Worker",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await session.commit()

        cal_date = date(2026, 11, 20)
        await set_tenant(session, tenant.id)

        cancelled_shift = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="FIXED",
            is_cancelled_paid=True,
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(9, 0),
                    end_time=time(18, 0),
                    break_duration_minutes=60,
                )
            ],
        )

        record, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
            shift_contract=cancelled_shift,
        )
        await session.commit()

        assert record.status == "PRESENT"
        assert float(record.worked_ratio) == 1.0
        assert "Employer-cancelled session" in trace.trace_payload["summary"]["explanation"]

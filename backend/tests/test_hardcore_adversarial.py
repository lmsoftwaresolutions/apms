from datetime import UTC, date, datetime, time
from uuid import uuid4
from zoneinfo import ZoneInfo

import pytest
from sqlalchemy import select, text
from sqlalchemy.exc import IntegrityError

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.models.branch import Branch
from app.models.department import Department
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.punch import PunchEvent, RawEnvelope
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.designations.repository import get_designation_by_id
from app.modules.designations.schemas import DesignationCreate, DesignationUpdate
from app.modules.designations.service import create_designation, delete_designation, update_designation
from app.modules.employees.schemas import EmployeeCreate
from app.modules.employees.service import create_employee
from app.modules.punches.repository import list_punch_events
from app.modules.punches.service import process_and_ingest_punches
from app.services.idempotency import replay_or_reserve, store_response

# Open follow-ups live in .agents/skills/hardcore-testing/SKILL.md section 4:
# sub-second debounce, same-timestamp multi-device punches, Aadhaar HMAC,
# and cross-tenant shift, employee, and attendance mutations.

IST = ZoneInfo("Asia/Kolkata")


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_adversarial_debounce_59s_vs_61s_boundary(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector A: Strict debounce window boundary check (BR-PCH-01).

    Punch 1 at t=00s.
    Punch 2 at t=59s (within 60s) -> Must be DUPLICATE_IGNORED.
    Punch 3 at t=61s (outside 60s) -> Must be ACTIVE.
    """
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None

        emp_code = f"ADV_DB_{uuid4().hex[:6].upper()}"
        emp = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch.id,
            employee_code=emp_code,
            full_name="Debounce Test Employee",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(emp)
        await session.commit()
        await set_tenant(session, tenant_a.id)

        # 1. First punch at 10:00:00
        p1_payload = {
            "PunchData": [{"Empcode": emp_code, "PunchDate": "23/11/2026 10:00:00"}]
        }
        res1 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", p1_payload, "DEV_01")
        assert res1.active_punches == 1
        assert res1.duplicates_ignored == 0

        # 2. Second punch at 10:00:59 (59s later -> inside 60s debounce window)
        p2_payload = {
            "PunchData": [{"Empcode": emp_code, "PunchDate": "23/11/2026 10:00:59"}]
        }
        res2 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", p2_payload, "DEV_01")
        assert res2.active_punches == 0
        assert res2.duplicates_ignored == 1

        # 3. Third punch at 10:01:01 (61s after p1 -> outside debounce window)
        p3_payload = {
            "PunchData": [{"Empcode": emp_code, "PunchDate": "23/11/2026 10:01:01"}]
        }
        res3 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", p3_payload, "DEV_01")
        assert res3.active_punches == 1
        assert res3.duplicates_ignored == 0

        # Verify database records
        events = await list_punch_events(session, tenant_a.id, employee_id=emp.id)
        events_by_time = sorted(events, key=lambda e: e.punch_time)
        assert len(events_by_time) == 3
        assert events_by_time[0].status == "ACTIVE"
        assert events_by_time[1].status == "DUPLICATE_IGNORED"
        assert events_by_time[2].status == "ACTIVE"


@pytest.mark.asyncio
async def test_adversarial_multi_device_simultaneous_punch(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector A: Multi-device collision at same branch.

    Worker taps at Gate 1 machine, then immediately at Gate 2 machine.
    Debounce must protect across different device identifiers.
    """
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None

        emp_code = f"ADV_MD_{uuid4().hex[:6].upper()}"
        emp = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch.id,
            employee_code=emp_code,
            full_name="Multi Device Employee",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(emp)
        await session.commit()
        await set_tenant(session, tenant_a.id)

        # Gate 1 punch at 08:30:00
        p_gate1 = {"PunchData": [{"Empcode": emp_code, "PunchDate": "23/11/2026 08:30:00"}]}
        res1 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", p_gate1, "DEVICE_GATE_1")
        assert res1.active_punches == 1

        # Gate 2 punch at 08:30:15 (15 seconds later from a different device)
        p_gate2 = {"PunchData": [{"Empcode": emp_code, "PunchDate": "23/11/2026 08:30:15"}]}
        res2 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", p_gate2, "DEVICE_GATE_2")
        assert res2.active_punches == 0
        assert res2.duplicates_ignored == 1


@pytest.mark.asyncio
async def test_adversarial_raw_envelope_idempotent_replay(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector E: Exact raw payload resubmitted must be completely idempotent."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None

        emp_code = f"ADV_IDEM_{uuid4().hex[:6].upper()}"
        emp = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch.id,
            employee_code=emp_code,
            full_name="Idempotency Employee",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(emp)
        await session.commit()
        await set_tenant(session, tenant_a.id)

        raw_payload = {"PunchData": [{"Empcode": emp_code, "PunchDate": "23/11/2026 09:15:00"}]}

        # First ingestion
        res1 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", raw_payload, "DEV_A")
        assert not res1.is_duplicate
        assert res1.active_punches == 1

        # Duplicate re-transmission
        res2 = await process_and_ingest_punches(session, tenant_a.id, "ETIMEOFFICE", raw_payload, "DEV_A")
        assert res2.is_duplicate
        assert res2.raw_envelope_id == res1.raw_envelope_id
        assert res2.active_punches == 0

        # Verify only 1 punch event exists
        events = await list_punch_events(session, tenant_a.id, employee_id=emp.id)
        assert len(events) == 1


@pytest.mark.asyncio
async def test_adversarial_overnight_month_boundary_attribution(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector B: Overnight shift crossing month-end (2026-03-31 22:00 -> 2026-04-01 06:00).

    BR-ATT-03: Attendance MUST be attributed to commencement date D (2026-03-31),
    never split across two calendar days or awarded to April 1st.
    """
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
                employee_code=f"ADV_ON_{uuid4().hex[:6].upper()}",
                full_name="Overnight Month Crosser",
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
                payload_hash=uuid4().hex,
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        cal_date = date(2026, 3, 31)

        # Overnight punches across month boundary: 22:00 IST on March 31, 06:00 IST on April 1
        p_in_ist = datetime(2026, 3, 31, 22, 0, tzinfo=IST)
        p_out_ist = datetime(2026, 4, 1, 6, 0, tzinfo=IST)

        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=p_in_ist.astimezone(UTC),
                punch_direction="IN",
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
                punch_time=p_out_ist.astimezone(UTC),
                punch_direction="OUT",
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        await session.flush()

        # Shift Contract: 22:00 to 06:00 overnight
        contract = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="OVERNIGHT",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(22, 0),
                    end_time=time(6, 0),
                    pre_window_minutes=60,
                    post_window_minutes=60,
                    min_presence_ratio=0.50,
                    is_overnight=True,
                )
            ],
        )

        daily_rec, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
            shift_contract=contract,
        )

        # Attributed strictly to commencement date
        assert daily_rec.calendar_date == cal_date
        assert daily_rec.status == "PRESENT"
        assert daily_rec.worked_duration_minutes == 480
        assert daily_rec.scheduled_duration_minutes == 480
        assert not daily_rec.is_single_punch


@pytest.mark.asyncio
async def test_adversarial_q4_lone_punch_zero_overtime_invariant(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector C: Confirmed Q4 lone-punch anomaly.

    A single IN punch must NEVER auto-grant overtime or evaluate to PRESENT.
    Must evaluate to NEEDS_REVIEW with anomaly_code = LONE_PUNCH_ANOMALY and overtime = 0.
    """
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
                employee_code=f"ADV_LP_{uuid4().hex[:6].upper()}",
                full_name="Lone Punch Employee",
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
                payload_hash=uuid4().hex,
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        cal_date = date(2026, 11, 23)
        # Single IN punch at 09:00
        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant.id,
                raw_envelope_id=env_id,
                employee_id=emp_id,
                punch_time=datetime(2026, 11, 23, 9, 0, tzinfo=IST).astimezone(UTC),
                punch_direction="IN",
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
        await session.flush()

        contract = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="FIXED",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(9, 0),
                    end_time=time(18, 0),
                    pre_window_minutes=60,
                    post_window_minutes=60,
                )
            ],
        )

        daily_rec, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
            shift_contract=contract,
        )

        # Invariants:
        assert daily_rec.status == "NEEDS_REVIEW"
        assert daily_rec.is_single_punch is True
        assert daily_rec.anomaly_code == "LONE_PUNCH_ANOMALY"
        assert daily_rec.overtime_minutes == 0, "Lone punch must NEVER grant overtime!"


@pytest.mark.asyncio
async def test_adversarial_n65_split_shift_gap_pollution_defense(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector C: Confirmed N65 mid-session gap exclusion.

    Schedule: Session 1 (08:00–12:00), Gap (12:00–16:00, 4h), Session 2 (16:00–20:00). Total scheduled = 8h.
    Punches during the 4-hour gap (13:00, 14:30) must be discarded and NOT leak into worked hours.
    """
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
                employee_code=f"ADV_N65_{uuid4().hex[:6].upper()}",
                full_name="Gap Pollution Employee",
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
                payload_hash=uuid4().hex,
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()

        cal_date = date(2026, 11, 23)

        # Legitimate session punches + stray gap punches
        punch_times_ist = [
            datetime(2026, 11, 23, 8, 0, tzinfo=IST),   # S1 In
            datetime(2026, 11, 23, 12, 0, tzinfo=IST),  # S1 Out
            datetime(2026, 11, 23, 12, 20, tzinfo=IST),  # Inside S1 post-window and inside the gap
            datetime(2026, 11, 23, 13, 0, tzinfo=IST),  # Stray punch inside gap
            datetime(2026, 11, 23, 14, 30, tzinfo=IST),  # Stray punch inside gap
            datetime(2026, 11, 23, 16, 0, tzinfo=IST),  # S2 In
            datetime(2026, 11, 23, 20, 0, tzinfo=IST),  # S2 Out
        ]

        for pt in punch_times_ist:
            session.add(
                PunchEvent(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    raw_envelope_id=env_id,
                    employee_id=emp_id,
                    punch_time=pt.astimezone(UTC),
                    punch_direction="UNKNOWN",
                    source="TEST",
                    status="ACTIVE",
                    created_at=datetime.now(UTC),
                )
            )
        await session.flush()

        contract = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="SPLIT",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(8, 0),
                    end_time=time(12, 0),
                    pre_window_minutes=30,
                    post_window_minutes=30,
                ),
                SessionWindow(
                    session_order=2,
                    start_time=time(16, 0),
                    end_time=time(20, 0),
                    pre_window_minutes=30,
                    post_window_minutes=30,
                ),
            ],
        )

        daily_rec, trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp_id,
            calendar_date=cal_date,
            shift_contract=contract,
        )

        # Invariants: 4h + 4h = 8h (480 min). 4-hour gap is 100% excluded!
        assert daily_rec.worked_duration_minutes == 480
        assert daily_rec.scheduled_duration_minutes == 480
        assert daily_rec.status == "PRESENT"
        assert daily_rec.overtime_minutes == 0, "Gap punches must not create overtime!"
        assert trace.trace_payload["summary"]["mid_gap_minutes_excluded"] == 240


@pytest.mark.asyncio
async def test_adversarial_unscheduled_shift_422_rejection(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector C: Evaluating attendance on an unscheduled employee date must fail with 422."""
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
                employee_code=f"ADV_UNSCH_{uuid4().hex[:6].upper()}",
                full_name="Unscheduled Employee",
                date_of_joining=date(2026, 1, 1),
                is_active=True,
                created_at=datetime.now(UTC),
                updated_at=datetime.now(UTC),
            )
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        # Call calculate without shift_contract and without materialized DatedShiftInstance in DB
        with pytest.raises(ProblemError) as exc_info:
            await calculate_and_save_daily_attendance(
                session=session,
                tenant_id=tenant.id,
                employee_id=emp_id,
                calendar_date=date(2026, 11, 23),
            )
        assert exc_info.value.status == 422
        assert "Unscheduled shift evaluation" in exc_info.value.title


@pytest.mark.asyncio
async def test_adversarial_negative_rls_cross_tenant_punch_probe(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector D: Multi-tenant negative isolation test for punches.

    Tenant B cannot query Tenant A's punches via direct SQL or repository methods.
    """
    tenant_a, tenant_b = seeded_tenants

    # Step 1: Create employee and punch in Tenant A
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        branch_a = await session_a.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch_a

        emp_a = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch_a.id,
            employee_code=f"ADV_RLS_{uuid4().hex[:6].upper()}",
            full_name="Tenant A Employee",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session_a.add(emp_a)

        env_a = RawEnvelope(
            id=uuid4(),
            tenant_id=tenant_a.id,
            source="TEST",
            raw_payload={"secret": "Tenant A Secret"},
            payload_hash=uuid4().hex,
            received_at=datetime.now(UTC),
        )
        session_a.add(env_a)
        await session_a.flush()

        punch_a = PunchEvent(
            id=uuid4(),
            tenant_id=tenant_a.id,
            raw_envelope_id=env_a.id,
            employee_id=emp_a.id,
            punch_time=datetime(2026, 11, 23, 9, 0, tzinfo=UTC),
            punch_direction="IN",
            source="TEST",
            status="ACTIVE",
            created_at=datetime.now(UTC),
        )
        session_a.add(punch_a)
        await session_a.commit()

    # Step 2: Under Tenant B session context, probe for Tenant A's data
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)

        # 1. Direct SQL select across tenants returns 0 rows
        direct_raw = (
            await session_b.execute(text("SELECT id FROM raw_envelope WHERE id = :id"), {"id": env_a.id})
        ).fetchall()
        assert direct_raw == [], "Tenant B must not see Tenant A raw envelope!"

        direct_punch = (
            await session_b.execute(text("SELECT id FROM punch_event WHERE id = :id"), {"id": punch_a.id})
        ).fetchall()
        assert direct_punch == [], "Tenant B must not see Tenant A punch event!"

        # 2. Repository list_punch_events for emp_a under Tenant B returns empty list
        b_list = await list_punch_events(session_b, tenant_b.id, employee_id=emp_a.id)
        assert b_list == [], "Repository query under Tenant B must return empty list!"


def _employee(tenant_id, branch_id, code: str, name: str) -> Employee:
    now = datetime.now(UTC)
    return Employee(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch_id,
        employee_code=code,
        full_name=name,
        date_of_joining=date(2026, 1, 1),
        is_active=True,
        created_at=now,
        updated_at=now,
    )


async def _branch(session, tenant_id):
    branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_id))
    assert branch is not None
    return branch


@pytest.mark.asyncio
async def test_adversarial_append_only_punch_grants(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector E: apms_app cannot update or delete raw envelopes or punch events."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        for statement in (
            "UPDATE raw_envelope SET source = 'TAMPERED' WHERE tenant_id = :tid",
            "DELETE FROM raw_envelope WHERE tenant_id = :tid",
            "UPDATE punch_event SET status = 'TAMPERED' WHERE tenant_id = :tid",
            "DELETE FROM punch_event WHERE tenant_id = :tid",
        ):
            with pytest.raises(Exception) as exc_info:
                await session.execute(text(statement), {"tid": tenant.id})
                await session.commit()
            assert "permission denied" in str(exc_info.value).lower()
            await session.rollback()
            await set_tenant(session, tenant.id)


@pytest.mark.asyncio
async def test_adversarial_n66b_split_session_caps_present_at_half_day(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector C: a completed long session plus a missed short session stays HALF_DAY.

    9h worked of 10h scheduled is 0.90, which would be PRESENT. N66b caps it because
    the second session has no punches.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await _branch(session, tenant.id)
        emp = _employee(tenant.id, branch.id, f"ADV_CAP_{uuid4().hex[:6].upper()}", "Capped Split")
        session.add(emp)
        env_id = uuid4()
        session.add(
            RawEnvelope(
                id=env_id,
                tenant_id=tenant.id,
                source="TEST",
                raw_payload={},
                payload_hash=uuid4().hex,
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()
        cal_date = date(2026, 11, 23)
        for hour in (8, 17):
            session.add(
                PunchEvent(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    raw_envelope_id=env_id,
                    employee_id=emp.id,
                    punch_time=datetime(2026, 11, 23, hour, 0, tzinfo=IST).astimezone(UTC),
                    punch_direction="UNKNOWN",
                    source="TEST",
                    status="ACTIVE",
                    created_at=datetime.now(UTC),
                )
            )
        await session.flush()
        contract = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="SPLIT",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(8, 0),
                    end_time=time(17, 0),
                    pre_window_minutes=30,
                    post_window_minutes=30,
                    min_presence_ratio=0.50,
                ),
                SessionWindow(
                    session_order=2,
                    start_time=time(18, 0),
                    end_time=time(19, 0),
                    pre_window_minutes=15,
                    post_window_minutes=15,
                    min_presence_ratio=0.50,
                ),
            ],
        )
        daily_rec, _trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=cal_date,
            shift_contract=contract,
        )
        assert daily_rec.worked_duration_minutes == 540
        assert daily_rec.scheduled_duration_minutes == 600
        assert daily_rec.status == "HALF_DAY"


@pytest.mark.asyncio
async def test_adversarial_clock_drift_and_out_of_order_ingest(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector B: a punch far from receipt is flagged, and a later out ingested first still pairs."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await _branch(session, tenant.id)
        code = f"ADV_ORD_{uuid4().hex[:6].upper()}"
        emp = _employee(tenant.id, branch.id, code, "Out Of Order")
        session.add(emp)
        await session.commit()
        await set_tenant(session, tenant.id)

        drifted = {"PunchData": [{"Empcode": code, "PunchDate": "01/01/2020 08:00:00"}]}
        await process_and_ingest_punches(session, tenant.id, "ETIMEOFFICE", drifted, "DEV_DRIFT")
        events = await list_punch_events(session, tenant.id, employee_id=emp.id)
        assert events
        assert events[0].location_meta is not None
        assert events[0].location_meta.get("clock_drift_warning") is True

        out_first = {"PunchData": [{"Empcode": code, "PunchDate": "23/11/2026 18:00:00"}]}
        in_second = {"PunchData": [{"Empcode": code, "PunchDate": "23/11/2026 09:00:00"}]}
        await process_and_ingest_punches(session, tenant.id, "ETIMEOFFICE", out_first, "DEV_ORDER")
        await process_and_ingest_punches(session, tenant.id, "ETIMEOFFICE", in_second, "DEV_ORDER")
        contract = ShiftInstanceContract(
            calendar_date=date(2026, 11, 23),
            shift_type="FIXED",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(9, 0),
                    end_time=time(18, 0),
                    pre_window_minutes=30,
                    post_window_minutes=30,
                    min_presence_ratio=0.50,
                )
            ],
        )
        daily_rec, _trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=date(2026, 11, 23),
            shift_contract=contract,
        )
        assert daily_rec.status == "PRESENT"
        assert daily_rec.worked_duration_minutes == 540


@pytest.mark.asyncio
async def test_adversarial_idempotency_key_rejects_mutated_body(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector E: the same Idempotency-Key with a different body is a conflict."""
    tenant, _ = seeded_tenants
    key = f"adv-{uuid4().hex}"
    path = "/api/v1/designations"

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        await store_response(session, tenant.id, key, path, {"name": "Operator"}, 201, {"id": "one"})
        with pytest.raises(ProblemError) as exc_info:
            await replay_or_reserve(session, tenant.id, key, path, {"name": "Supervisor"})
        assert exc_info.value.status == 409
        replay = await replay_or_reserve(session, tenant.id, key, path, {"name": "Operator"})
        assert replay is not None
        assert replay["replay"] is True


@pytest.mark.asyncio
async def test_adversarial_pii_ciphertext_hides_plaintext(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector F: stored PAN and bank account columns do not contain the plaintext."""
    tenant, _ = seeded_tenants
    pan = "ABCDE1234F"
    account = "123456789012"

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await _branch(session, tenant.id)
        created = await create_employee(
            session,
            tenant.id,
            EmployeeCreate(
                employee_code=f"ADV_PII_{uuid4().hex[:6].upper()}",
                full_name="Vault Probe",
                branch_id=branch.id,
                date_of_joining=date(2026, 1, 1),
                pan=pan,
                bank_account=account,
            ),
        )
        row = (
            await session.execute(
                text(
                    "SELECT pan_encrypted, pan_fingerprint, bank_account_encrypted "
                    "FROM employees WHERE id = :id"
                ),
                {"id": created.id},
            )
        ).one()
        assert pan not in (row.pan_encrypted or "")
        assert account not in (row.bank_account_encrypted or "")
        assert row.pan_fingerprint is not None
        assert pan not in row.pan_fingerprint
        assert len(row.pan_fingerprint) == 64


@pytest.mark.asyncio
async def test_adversarial_composite_fk_and_designation_tenant_wall(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector D: another tenant's branch cannot be stored, and its designation is invisible."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        branch_b = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_b.id))
        assert branch_b is None

    async with MigrateSession() as migrate:
        branch_b = await migrate.scalar(select(Branch).where(Branch.tenant_id == tenant_b.id))
        assert branch_b is not None
        branch_b_id = branch_b.id

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        session.add(
            _employee(tenant_a.id, branch_b_id, f"ADV_FK_{uuid4().hex[:6].upper()}", "Cross Branch")
        )
        with pytest.raises(IntegrityError):
            await session.flush()
        await session.rollback()
        await set_tenant(session, tenant_a.id)

        dept = await session.scalar(select(Department).where(Department.tenant_id == tenant_a.id))
        assert dept is not None
        code = f"ADV{uuid4().hex[:4].upper()}"
        created = await create_designation(
            session,
            tenant_a.id,
            DesignationCreate(department_id=dept.id, name=f"Probe {code}", code=code),
        )
        await session.commit()

    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)
        hidden = await get_designation_by_id(session_b, tenant_b.id, created.id)
        assert hidden is None
        leaked = (
            await session_b.execute(text("SELECT id FROM designations WHERE id = :id"), {"id": created.id})
        ).fetchall()
        assert leaked == []
        with pytest.raises(ProblemError) as exc_info:
            await update_designation(
                session_b,
                tenant_b.id,
                created.id,
                DesignationUpdate(name="Stolen"),
            )
        assert exc_info.value.status == 404
        with pytest.raises(ProblemError) as exc_del:
            await delete_designation(session_b, tenant_b.id, created.id)
        assert exc_del.value.status == 404

    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        await delete_designation(session_a, tenant_a.id, created.id)


@pytest.mark.asyncio
async def test_adversarial_overnight_year_boundary(seeded_tenants: tuple[Tenant, Tenant]):
    """Vector B: 2026-12-31 22:00 through 2027-01-01 06:00 belongs to 31 December."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        branch = await _branch(session, tenant.id)
        emp = _employee(tenant.id, branch.id, f"ADV_YR_{uuid4().hex[:6].upper()}", "Year Crosser")
        session.add(emp)
        env_id = uuid4()
        session.add(
            RawEnvelope(
                id=env_id,
                tenant_id=tenant.id,
                source="TEST",
                raw_payload={},
                payload_hash=uuid4().hex,
                received_at=datetime.now(UTC),
            )
        )
        await session.flush()
        cal_date = date(2026, 12, 31)
        for punch_at in (
            datetime(2026, 12, 31, 22, 0, tzinfo=IST),
            datetime(2027, 1, 1, 6, 0, tzinfo=IST),
        ):
            session.add(
                PunchEvent(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    raw_envelope_id=env_id,
                    employee_id=emp.id,
                    punch_time=punch_at.astimezone(UTC),
                    punch_direction="UNKNOWN",
                    source="TEST",
                    status="ACTIVE",
                    created_at=datetime.now(UTC),
                )
            )
        await session.flush()
        contract = ShiftInstanceContract(
            calendar_date=cal_date,
            shift_type="OVERNIGHT",
            sessions=[
                SessionWindow(
                    session_order=1,
                    start_time=time(22, 0),
                    end_time=time(6, 0),
                    pre_window_minutes=60,
                    post_window_minutes=60,
                    min_presence_ratio=0.50,
                    is_overnight=True,
                )
            ],
        )
        daily_rec, _trace = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=cal_date,
            shift_contract=contract,
        )
        assert daily_rec.calendar_date == cal_date
        assert daily_rec.status == "PRESENT"
        assert daily_rec.worked_duration_minutes == 480

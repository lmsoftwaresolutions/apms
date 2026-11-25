from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.main import app
from app.models.attendance import AttendanceDailyRecord
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Tenant
from app.models.policy import PolicyMaster
from app.models.punch import PunchEvent, RawEnvelope
from app.models.shift import ShiftTemplate
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.engine.pairing import pair_punches_for_shift
from app.modules.attendance.engine.rollup import evaluate_daily_rollup
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.policies.schemas import PolicyCreate, PolicyUpdate
from app.modules.policies.service import (
    create_policy,
    delete_policy,
    get_policy,
    list_policies,
    update_policy,
)
from app.modules.shifts.schemas import ShiftSessionCreate, ShiftTemplateCreate
from app.modules.shifts.service import create_template


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


@pytest.mark.asyncio
async def test_policy_crud_and_validation(seeded_tenants: tuple[Tenant, Tenant]):
    """1. Policy CRUD & Validation: Verify creating, reading, updating, and deleting policies."""
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        # 1. Validation error: half_day >= full_day
        with pytest.raises(ValueError, match="half_day_work_duration_minutes must be strictly less"):
            PolicyCreate(
                code="INVALID_DUR",
                name="Invalid Policy",
                half_day_work_duration_minutes=480,
                full_day_work_duration_minutes=480,
            )

        # 2. Validation error: half_cutoff >= absent_cutoff
        with pytest.raises(ValueError, match="half_day_late_cutoff_minutes must be strictly less"):
            PolicyCreate(
                code="INVALID_CUTOFF",
                name="Invalid Cutoff",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=480,
                half_day_late_cutoff_minutes=120,
                absent_late_cutoff_minutes=120,
            )

        # 3. Create valid policy
        pol = await create_policy(
            session,
            tenant_a.id,
            PolicyCreate(
                code=f"POL_{uuid4().hex[:6].upper()}",
                name="Engineering Attendance Policy",
                description="Engineering unit attendance policy",
                late_arrival_allow_minutes=15,
                early_departure_allow_minutes=10,
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=480,
                half_day_late_cutoff_minutes=90,
                absent_late_cutoff_minutes=180,
                ot_minimum_minutes=30,
                ot_multiplier=Decimal("1.50"),
                max_ot_minutes_per_day=120,
            ),
        )
        await session.commit()
        pol_id = pol.id

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        # 4. Read policy
        fetched = await get_policy(session, tenant_a.id, pol_id)
        assert fetched.name == "Engineering Attendance Policy"
        assert fetched.late_arrival_allow_minutes == 15
        assert fetched.ot_multiplier == Decimal("1.50")

        # 5. List policies
        all_pols = await list_policies(session, tenant_a.id)
        assert any(p.id == pol_id for p in all_pols)

        # 6. Update policy
        updated = await update_policy(
            session,
            tenant_a.id,
            pol_id,
            PolicyUpdate(name="Engineering Policy Updated", late_arrival_allow_minutes=20),
        )
        await session.commit()
        await set_tenant(session, tenant_a.id)
        assert updated.name == "Engineering Policy Updated"
        assert updated.late_arrival_allow_minutes == 20

        # 7. Delete policy
        await delete_policy(session, tenant_a.id, pol_id)
        await session.commit()
        await set_tenant(session, tenant_a.id)

        # 8. Verify deleted -> 404
        with pytest.raises(ProblemError) as exc_info:
            await get_policy(session, tenant_a.id, pol_id)
        assert exc_info.value.status == 404


@pytest.mark.asyncio
async def test_shift_template_linkage_and_delete_protection(seeded_tenants: tuple[Tenant, Tenant]):
    """2. Shift Template Linkage & Delete Protection:

    Verify shift template foreign key linkage, and policy deletion is prevented while in use.
    """
    tenant_a, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)

        # Create policy
        pol = await create_policy(
            session,
            tenant_a.id,
            PolicyCreate(
                code=f"POL_LINK_{uuid4().hex[:6].upper()}",
                name="Linkage Test Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
            ),
        )
        await session.commit()
        await set_tenant(session, tenant_a.id)
        pol_id = pol.id

        # Create shift template referencing policy
        tpl_code = f"SH_POL_{uuid4().hex[:6].upper()}"
        tpl = await create_template(
            session,
            tenant_a.id,
            ShiftTemplateCreate(
                code=tpl_code,
                name="Policy Linked Shift",
                policy_id=pol_id,
                sessions=[
                    ShiftSessionCreate(
                        session_order=1,
                        name="General",
                        start_time=time(9, 0),
                        end_time=time(18, 0),
                    )
                ],
            ),
        )
        await session.commit()
        await set_tenant(session, tenant_a.id)
        assert tpl.policy_id == pol_id

        # Verify deletion is blocked while policy is in use -> 409
        with pytest.raises(ProblemError) as exc_del:
            await delete_policy(session, tenant_a.id, pol_id)
        assert exc_del.value.status == 409
        assert "attached to 1 shift template" in exc_del.value.detail


@pytest.mark.asyncio
async def test_negative_rls_isolation(seeded_tenants: tuple[Tenant, Tenant]):
    """3. Negative RLS Isolation: Tenant A cannot read, update, or link Tenant B's policies."""
    tenant_a, tenant_b = seeded_tenants

    # Step 1: Create policy in Tenant A
    async with SessionLocal() as session_a:
        await set_tenant(session_a, tenant_a.id)
        pol_a = await create_policy(
            session_a,
            tenant_a.id,
            PolicyCreate(
                code=f"POL_A_{uuid4().hex[:6].upper()}",
                name="Secret Policy A",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
            ),
        )
        await session_a.commit()
        pol_a_id = pol_a.id

    # Step 2: In Tenant B context, verify total isolation
    async with SessionLocal() as session_b:
        await set_tenant(session_b, tenant_b.id)

        # Cannot get Tenant A's policy -> 404
        with pytest.raises(ProblemError) as exc_info:
            await get_policy(session_b, tenant_b.id, pol_a_id)
        assert exc_info.value.status == 404

        # Cannot list Tenant A's policy
        b_pols = await list_policies(session_b, tenant_b.id)
        assert all(p.id != pol_a_id for p in b_pols)

        # Cannot update Tenant A's policy
        with pytest.raises(ProblemError) as exc_up:
            await update_policy(session_b, tenant_b.id, pol_a_id, PolicyUpdate(name="Hacked"))
        assert exc_up.value.status == 404

        # Cannot delete Tenant A's policy
        with pytest.raises(ProblemError) as exc_del:
            await delete_policy(session_b, tenant_b.id, pol_a_id)
        assert exc_del.value.status == 404

        # Cannot link Tenant A's policy to a shift in Tenant B -> 404
        with pytest.raises(ProblemError) as exc_link:
            await create_template(
                session_b,
                tenant_b.id,
                ShiftTemplateCreate(
                    code=f"SH_B_{uuid4().hex[:6].upper()}",
                    name="Tenant B Shift Trying To Steal Policy",
                    policy_id=pol_a_id,
                    sessions=[
                        ShiftSessionCreate(
                            session_order=1,
                            name="General",
                            start_time=time(9, 0),
                            end_time=time(18, 0),
                        )
                    ],
                ),
            )
        assert exc_link.value.status == 404


def test_golden_vector_late_grace():
    """4. Golden Vector — Late Grace:

    09:00 shift with 15-minute late grace. Employee punches at 09:12 -> verify late_minutes == 0 and status is PRESENT.
    """
    cal_date = date(2026, 11, 20)
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
            )
        ],
    )

    # 15-min late grace policy
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_GRACE",
        name="15 Min Grace Policy",
        late_arrival_allow_minutes=15,
        early_departure_allow_minutes=10,
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )

    # Punches: In at 09:12 IST (03:42 UTC), Out at 18:00 IST (12:30 UTC)
    p_in = datetime(2026, 11, 20, 3, 42, 0, tzinfo=UTC)
    p_out = datetime(2026, 11, 20, 12, 30, 0, tzinfo=UTC)
    punches = [
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_in, status="ACTIVE"),
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_out, status="ACTIVE"),
    ]

    pairing = pair_punches_for_shift(shift, punches, policy=policy)
    assert pairing.total_late_minutes == 0, "Arrival at 09:12 with 15m grace must produce late_minutes == 0"

    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert decision.late_minutes == 0
    assert decision.status == "PRESENT"


def test_golden_vector_severe_late_cutoff():
    """5. Golden Vector — Severe Late Cutoff:

    Employee arrives 130 minutes late for shift with absent_late_cutoff_minutes = 120 -> verify status is ABSENT.
    """
    cal_date = date(2026, 11, 20)
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
            )
        ],
    )

    # absent_late_cutoff_minutes = 120
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_CUTOFF",
        name="Cutoff Policy",
        late_arrival_allow_minutes=15,
        half_day_late_cutoff_minutes=90,
        absent_late_cutoff_minutes=120,
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )

    # 130 minutes late: punch in at 11:10 IST (05:40 UTC), out at 18:00 IST (12:30 UTC)
    p_in = datetime(2026, 11, 20, 5, 40, 0, tzinfo=UTC)
    p_out = datetime(2026, 11, 20, 12, 30, 0, tzinfo=UTC)
    punches = [
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_in, status="ACTIVE"),
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_out, status="ACTIVE"),
    ]

    pairing = pair_punches_for_shift(shift, punches, policy=policy)
    assert pairing.total_late_minutes == 130

    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert decision.status == "ABSENT", "Arriving 130 minutes late when cutoff is 120 must mark ABSENT"
    assert decision.anomaly_code == "SEVERE_LATE_ABSENT"


def test_golden_vector_overtime_minimum_qualifier():
    """6. Golden Vector — Overtime Minimum Qualifier:

    Policy with ot_minimum_minutes = 30.
    Working 20 minutes extra produces overtime_minutes = 0.
    Working 45 minutes extra produces overtime_minutes = 45.
    """
    cal_date = date(2026, 11, 20)
    shift = ShiftInstanceContract(
        calendar_date=cal_date,
        shift_type="FIXED",
        sessions=[
            SessionWindow(
                session_order=1,
                start_time=time(9, 0),
                end_time=time(18, 0),  # 9h = 540 min scheduled
                pre_window_minutes=60,
                post_window_minutes=120,
            )
        ],
    )

    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_OT",
        name="OT Qualifier Policy",
        ot_minimum_minutes=30,
        full_day_work_duration_minutes=480,
    )

    # Case A: 20 minutes extra (in 09:00, out 18:20 -> 560m worked, scheduled 540m -> extra 20m)
    p_in = datetime(2026, 11, 20, 3, 30, 0, tzinfo=UTC)
    p_out_20 = datetime(2026, 11, 20, 12, 50, 0, tzinfo=UTC)
    punches_20 = [
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_in, status="ACTIVE"),
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_out_20, status="ACTIVE"),
    ]
    pairing_20 = pair_punches_for_shift(shift, punches_20, policy=policy)
    decision_20 = evaluate_daily_rollup(pairing_20, policy=policy)
    assert decision_20.overtime_minutes == 0, "20m extra with 30m OT threshold must yield 0 OT minutes"

    # Case B: 45 minutes extra (in 09:00, out 18:45 -> 585m worked, scheduled 540m -> extra 45m)
    p_out_45 = datetime(2026, 11, 20, 13, 15, 0, tzinfo=UTC)
    punches_45 = [
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_in, status="ACTIVE"),
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_out_45, status="ACTIVE"),
    ]
    pairing_45 = pair_punches_for_shift(shift, punches_45, policy=policy)
    decision_45 = evaluate_daily_rollup(pairing_45, policy=policy)
    assert decision_45.overtime_minutes == 45, "45m extra with 30m OT threshold must qualify and yield 45 OT minutes"


def test_configured_hours_decide_present_without_the_ratio_band():
    """A 9-hour present requirement does not treat 8 hours, or 90 percent, as present."""
    cal_date = date(2026, 11, 20)
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
            )
        ],
    )
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_NINE",
        name="Nine hour present",
        half_day_work_duration_minutes=270,
        full_day_work_duration_minutes=540,
    )
    p_in = datetime(2026, 11, 20, 3, 30, 0, tzinfo=UTC)
    p_out = datetime(2026, 11, 20, 11, 30, 0, tzinfo=UTC)  # 8 hours
    punches = [
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_in, status="ACTIVE"),
        PunchEvent(id=uuid4(), tenant_id=policy.tenant_id, raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_out, status="ACTIVE"),
    ]
    pairing = pair_punches_for_shift(shift, punches, policy=policy)
    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert pairing.total_worked_minutes == 480
    assert decision.status == "HALF_DAY"


def test_regression_guard_unlinked_policy_uses_defaults():
    """7. Regression Guard: Verify shifts without linked policy (policy_id = None) continue

    to use system defaults (0.90/0.50 ratios, 0 grace) without breaking.
    """
    cal_date = date(2026, 11, 20)
    shift = ShiftInstanceContract(
        calendar_date=cal_date,
        shift_type="FIXED",
        policy=None,
        sessions=[
            SessionWindow(
                session_order=1,
                start_time=time(9, 0),
                end_time=time(18, 0),
            )
        ],
    )

    # 10 minutes late without policy -> late_minutes == 10
    p_in = datetime(2026, 11, 20, 3, 40, 0, tzinfo=UTC)
    p_out = datetime(2026, 11, 20, 12, 30, 0, tzinfo=UTC)
    punches = [
        PunchEvent(id=uuid4(), tenant_id=uuid4(), raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_in, status="ACTIVE"),
        PunchEvent(id=uuid4(), tenant_id=uuid4(), raw_envelope_id=uuid4(), employee_id=uuid4(), punch_time=p_out, status="ACTIVE"),
    ]

    pairing = pair_punches_for_shift(shift, punches, policy=None)
    assert pairing.total_late_minutes == 10, "Without policy, 10m late should have 0 grace"

    decision = evaluate_daily_rollup(pairing, policy=None)
    # Worked 530 / 540 = 98.1% >= 90% -> PRESENT
    assert decision.status == "PRESENT"
    assert decision.late_minutes == 10


@pytest.mark.asyncio
async def test_policy_api_endpoints_and_rbac():
    """Verify HTTP API endpoints for policy CRUD under RBAC permissions."""
    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthenticated -> 401
        resp = await client.get("/api/v1/policies")
        assert resp.status_code == 401

        # 2. Login as admin
        login_resp = await client.post(
            "/api/v1/auth/login",
            json={"email": "admin@northmill.example", "password": "ChangeMe-Admin-1"},
        )
        assert login_resp.status_code == 200
        admin_token = login_resp.json()["access_token"]
        admin_headers = {"Authorization": f"Bearer {admin_token}"}

        # 3. Create policy via API
        pol_code = f"API_POL_{uuid4().hex[:6].upper()}"
        create_resp = await client.post(
            "/api/v1/policies",
            headers=admin_headers,
            json={
                "code": pol_code,
                "name": "API Created Policy",
                "late_arrival_allow_minutes": 15,
                "early_departure_allow_minutes": 10,
                "half_day_work_duration_minutes": 240,
                "full_day_work_duration_minutes": 480,
                "ot_minimum_minutes": 30,
            },
        )
        assert create_resp.status_code == 201
        created_id = create_resp.json()["id"]

        # 4. Get policy
        get_resp = await client.get(f"/api/v1/policies/{created_id}", headers=admin_headers)
        assert get_resp.status_code == 200
        assert get_resp.json()["code"] == pol_code

        # 5. Update policy
        update_resp = await client.put(
            f"/api/v1/policies/{created_id}",
            headers=admin_headers,
            json={"name": "API Policy Renamed", "late_arrival_allow_minutes": 25},
        )
        assert update_resp.status_code == 200
        assert update_resp.json()["name"] == "API Policy Renamed"
        assert update_resp.json()["late_arrival_allow_minutes"] == 25

        # 6. Delete policy
        del_resp = await client.delete(f"/api/v1/policies/{created_id}", headers=admin_headers)
        assert del_resp.status_code == 204

        # 7. Login as supervisor -> has policy.master.read, but not policy.master.create -> 403
        sup_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "supervisor@northmill.example", "password": "ChangeMe-Supervisor-1"},
        )
        assert sup_login.status_code == 200
        sup_token = sup_login.json()["access_token"]
        sup_headers = {"Authorization": f"Bearer {sup_token}"}

        # Supervisor can read
        sup_read = await client.get("/api/v1/policies", headers=sup_headers)
        assert sup_read.status_code == 200

        # Supervisor cannot create -> 403
        sup_create = await client.post(
            "/api/v1/policies",
            headers=sup_headers,
            json={"code": "SUP_FAIL", "name": "Fail"},
        )
        assert sup_create.status_code == 403


def _nine_to_six(cal_date: date) -> ShiftInstanceContract:
    return ShiftInstanceContract(
        calendar_date=cal_date,
        shift_type="FIXED",
        sessions=[
            SessionWindow(
                session_order=1,
                start_time=time(9, 0),
                end_time=time(18, 0),
                pre_window_minutes=120,
                post_window_minutes=180,
            )
        ],
    )


def _punch(tenant_id, when: datetime) -> PunchEvent:
    return PunchEvent(
        id=uuid4(),
        tenant_id=tenant_id,
        raw_envelope_id=uuid4(),
        employee_id=uuid4(),
        punch_time=when,
        status="ACTIVE",
    )


def test_ignore_window_excludes_only_deviations_within_the_allowance():
    """08:50 and 18:30 sit inside a 10-minute early window and a 30-minute late window.

    Those minutes stay off the duration. The recorded punches stay at 08:50 and 18:30.
    """
    cal_date = date(2026, 11, 20)
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_IGNORE",
        name="Ignore windows",
        early_arrival_ignore_minutes=10,
        late_departure_ignore_minutes=30,
        ot_minimum_minutes=30,
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )
    arrived = datetime(2026, 11, 20, 3, 20, tzinfo=UTC)  # 08:50 IST
    left = datetime(2026, 11, 20, 13, 0, tzinfo=UTC)  # 18:30 IST
    punches = [_punch(policy.tenant_id, arrived), _punch(policy.tenant_id, left)]
    pairing = pair_punches_for_shift(_nine_to_six(cal_date), punches, policy=policy)
    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert pairing.sessions[0].in_punch == arrived
    assert pairing.sessions[0].out_punch == left
    assert punches[0].punch_time == arrived
    assert punches[1].punch_time == left
    assert pairing.total_worked_minutes == 540
    assert decision.overtime_minutes == 0


def test_early_arrival_beyond_ignore_counts_in_full():
    """40 minutes early with a 10-minute ignore counts as 40 minutes of overtime."""
    cal_date = date(2026, 11, 20)
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_EARLY",
        name="Early beyond ignore",
        early_arrival_ignore_minutes=10,
        late_departure_ignore_minutes=30,
        ot_minimum_minutes=30,
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )
    arrived = datetime(2026, 11, 20, 2, 50, tzinfo=UTC)  # 08:20 IST
    left = datetime(2026, 11, 20, 12, 30, tzinfo=UTC)  # 18:00 IST
    punches = [_punch(policy.tenant_id, arrived), _punch(policy.tenant_id, left)]
    pairing = pair_punches_for_shift(_nine_to_six(cal_date), punches, policy=policy)
    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert pairing.sessions[0].in_punch == arrived
    assert punches[0].punch_time == arrived
    assert pairing.total_worked_minutes == 580
    assert decision.overtime_minutes == 40


def test_late_departure_beyond_ignore_counts_in_full():
    """45 minutes late with a 30-minute ignore counts as 45 minutes of overtime."""
    cal_date = date(2026, 11, 20)
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_LATE",
        name="Late beyond ignore",
        early_arrival_ignore_minutes=10,
        late_departure_ignore_minutes=30,
        ot_minimum_minutes=30,
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )
    arrived = datetime(2026, 11, 20, 3, 30, tzinfo=UTC)  # 09:00 IST
    left = datetime(2026, 11, 20, 13, 15, tzinfo=UTC)  # 18:45 IST
    punches = [_punch(policy.tenant_id, arrived), _punch(policy.tenant_id, left)]
    pairing = pair_punches_for_shift(_nine_to_six(cal_date), punches, policy=policy)
    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert pairing.sessions[0].out_punch == left
    assert punches[1].punch_time == left
    assert pairing.total_worked_minutes == 585
    assert decision.overtime_minutes == 45


def test_early_and_late_beyond_ignore_add_together():
    """08:10 to 18:55 is 50 minutes early and 55 minutes late, so overtime is 105."""
    cal_date = date(2026, 11, 20)
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_BOTH",
        name="Early and late beyond ignore",
        early_arrival_ignore_minutes=10,
        late_departure_ignore_minutes=30,
        ot_minimum_minutes=30,
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )
    arrived = datetime(2026, 11, 20, 2, 40, tzinfo=UTC)  # 08:10 IST
    left = datetime(2026, 11, 20, 13, 25, tzinfo=UTC)  # 18:55 IST
    punches = [_punch(policy.tenant_id, arrived), _punch(policy.tenant_id, left)]
    pairing = pair_punches_for_shift(_nine_to_six(cal_date), punches, policy=policy)
    decision = evaluate_daily_rollup(pairing, policy=policy)
    assert pairing.sessions[0].in_punch == arrived
    assert pairing.sessions[0].out_punch == left
    assert punches[0].punch_time == arrived
    assert punches[1].punch_time == left
    assert pairing.total_worked_minutes == 645
    assert decision.overtime_minutes == 105


def test_all_in_out_excludes_the_gap_between_pairs():
    cal_date = date(2026, 11, 20)
    policy = PolicyMaster(
        id=uuid4(),
        tenant_id=uuid4(),
        code="POL_ALL",
        name="All in out",
        in_out_rule="ALL_IN_OUT",
        full_day_work_duration_minutes=480,
        half_day_work_duration_minutes=240,
    )
    punches = [
        _punch(policy.tenant_id, datetime(2026, 11, 20, 3, 30, tzinfo=UTC)),  # 09:00
        _punch(policy.tenant_id, datetime(2026, 11, 20, 7, 30, tzinfo=UTC)),  # 13:00
        _punch(policy.tenant_id, datetime(2026, 11, 20, 8, 30, tzinfo=UTC)),  # 14:00
        _punch(policy.tenant_id, datetime(2026, 11, 20, 12, 30, tzinfo=UTC)),  # 18:00
    ]
    pairing = pair_punches_for_shift(_nine_to_six(cal_date), punches, policy=policy)
    assert pairing.total_worked_minutes == 480

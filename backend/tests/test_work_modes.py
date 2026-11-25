from datetime import UTC, date, datetime, time
from decimal import Decimal
from uuid import uuid4

import httpx
import pytest
from httpx import ASGITransport
from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.core.errors import ProblemError
from app.core.security import hash_password
from app.main import app
from app.models.leave import LeaveTransaction, LeaveType
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Role, Tenant, User, UserRole
from app.models.punch import PunchEvent, RawEnvelope
from app.models.roster import DatedShiftInstance
from app.models.shift import ShiftTemplate
from app.models.work_mode import WorkModeRequest
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.engine.pairing import pair_punches_for_shift
from app.modules.attendance.engine.rollup import evaluate_daily_rollup
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.leave.ledger import balance
from app.modules.leave.repository import insert_transaction, list_transactions
from app.modules.policies.schemas import PolicyCreate
from app.modules.policies.service import create_policy
from app.modules.work_modes.schemas import WorkModeApply
from app.modules.work_modes.service import apply_work_mode, get_work_mode_request, review_work_mode


@pytest.fixture
async def seeded_tenants() -> tuple[Tenant, Tenant]:
    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        tenant_b = await session.scalar(select(Tenant).where(Tenant.subdomain == "southmill"))
        assert tenant_a and tenant_b, "Database must be seeded with northmill and southmill"
        return tenant_a, tenant_b


async def _create_test_employee(session, tenant_id) -> Employee:
    branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_id))
    assert branch is not None
    emp = Employee(
        id=uuid4(),
        tenant_id=tenant_id,
        branch_id=branch.id,
        employee_code=f"WM_{uuid4().hex[:6].upper()}",
        full_name="WorkMode Test Employee",
        date_of_joining=date(2026, 1, 1),
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(emp)
    await session.flush()
    return emp


@pytest.mark.asyncio
async def test_wfh_auto_approval_quota(seeded_tenants: tuple[Tenant, Tenant]):
    """BR-WFH-01 / Confirmed Q6: WFH Auto-Approval Quota.

    If approved WFH days in current month < quota, auto-approve.
    When quota is reached, request enters PENDING status for supervisor review.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)

        policy = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"WFH_Q_{uuid4().hex[:6].upper()}",
                name="Quota Two",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                wfh_monthly_auto_quota=2,
            ),
        )
        tight = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"WFH_ZERO_{uuid4().hex[:6].upper()}",
                name="Quota Zero Unlinked",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                wfh_monthly_auto_quota=0,
            ),
        )
        now = datetime.now(UTC)
        template = ShiftTemplate(
            id=uuid4(),
            tenant_id=tenant.id,
            policy_id=policy.id,
            code=f"WM_{uuid4().hex[:6].upper()}",
            name="Linked day",
            shift_type="FIXED",
            created_at=now,
            updated_at=now,
        )
        session.add(template)
        await session.flush()
        for day in (date(2026, 11, 2), date(2026, 11, 3), date(2026, 11, 4), date(2026, 11, 5)):
            session.add(
                DatedShiftInstance(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    employee_id=emp.id,
                    calendar_date=day,
                    shift_template_id=template.id,
                    status="SCHEDULED",
                    resolution_mode="DIRECT_ASSIGNMENT",
                    sessions=[],
                    created_at=now,
                    updated_at=now,
                )
            )
        await session.flush()
        assert tight.wfh_monthly_auto_quota == 0
        unlinked = await _create_test_employee(session, tenant.id)
        await session.commit()
        await set_tenant(session, tenant.id)

        outside = await apply_work_mode(
            session,
            tenant.id,
            unlinked.id,
            WorkModeApply(
                work_mode="WFH",
                calendar_date=date(2026, 11, 2),
                session_target="FULL",
                reason="No shift policy is attached",
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert outside.status == "APPROVED"

        # 1st WFH request -> auto-approved (0 used < 2)
        req1 = await apply_work_mode(
            session,
            tenant.id,
            emp.id,
            WorkModeApply(
                work_mode="WFH",
                calendar_date=date(2026, 11, 2),
                session_target="FULL",
                reason="Home study and research",
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert req1.status == "APPROVED"
        assert req1.is_auto_approved is True

        # 2nd WFH request -> auto-approved (1 used < 2)
        req2 = await apply_work_mode(
            session,
            tenant.id,
            emp.id,
            WorkModeApply(
                work_mode="WFH",
                calendar_date=date(2026, 11, 3),
                session_target="FULL",
                reason="Home maintenance day",
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert req2.status == "APPROVED"
        assert req2.is_auto_approved is True

        # 3rd WFH request -> PENDING (2 used >= 2 quota)
        req3 = await apply_work_mode(
            session,
            tenant.id,
            emp.id,
            WorkModeApply(
                work_mode="WFH",
                calendar_date=date(2026, 11, 4),
                session_target="FULL",
                reason="Extra WFH requested",
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert req3.status == "PENDING"
        assert req3.is_auto_approved is False

        # Fetch valid admin user for approver
        admin_user = await session.scalar(select(User).where(User.tenant_id == tenant.id))
        assert admin_user is not None
        approver_id = admin_user.id

        # Supervisor reviews req3: Rejection without reason fails with 422
        with pytest.raises(ProblemError) as exc_info:
            await review_work_mode(
                session, tenant.id, req3.id, approve=False, approver_user_id=approver_id, decision_reason=""
            )
        assert exc_info.value.status == 422

        # Supervisor approves req3
        approved_req3 = await review_work_mode(
            session, tenant.id, req3.id, approve=True, approver_user_id=approver_id, decision_reason="Approved exception"
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert approved_req3.status == "APPROVED"
        assert approved_req3.approver_user_id == approver_id

        # 4th WFH request -> PENDING; supervisor rejects with reason
        req4 = await apply_work_mode(
            session,
            tenant.id,
            emp.id,
            WorkModeApply(
                work_mode="WFH",
                calendar_date=date(2026, 11, 5),
                session_target="FULL",
                reason="Another WFH day",
            ),
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert req4.status == "PENDING"

        rejected_req4 = await review_work_mode(
            session,
            tenant.id,
            req4.id,
            approve=False,
            approver_user_id=approver_id,
            decision_reason="Exceeded monthly quota and high office backlog",
        )
        await session.commit()
        await set_tenant(session, tenant.id)
        assert rejected_req4.status == "REJECTED"
        assert rejected_req4.decision_reason == "Exceeded monthly quota and high office backlog"


@pytest.mark.asyncio
async def test_on_duty_evaluation_and_waiver(seeded_tenants: tuple[Tenant, Tenant]):
    """BR-ATT-17: On-Duty (OD) Work Mode.

    When approved, attendance rollup evaluates day as PRESENT (100% duration)
    with zero punches and waives late/early penalties.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)
        admin_user = await session.scalar(select(User).where(User.tenant_id == tenant.id))
        assert admin_user is not None
        cal_date = date(2026, 11, 10)

        # Apply for ON_DUTY -> begins as PENDING
        req = await apply_work_mode(
            session,
            tenant.id,
            emp.id,
            WorkModeApply(
                work_mode="ON_DUTY",
                calendar_date=cal_date,
                session_target="FULL",
                reason="Client audit visit at customer premises",
            ),
        )
        assert req.status == "PENDING"
        assert req.is_auto_approved is False

        # Supervisor approves ON_DUTY
        await review_work_mode(
            session, tenant.id, req.id, approve=True, approver_user_id=admin_user.id, decision_reason="Verified client schedule"
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        # Schedule a 9h shift contract with 0 punches recorded
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
            employee_id=emp.id,
            calendar_date=cal_date,
            shift_contract=shift,
        )
        await session.commit()

        # Verify On-Duty credits PRESENT with zero late penalties and 100% duration
        assert record.status == "PRESENT"
        assert record.worked_duration_minutes == 540
        assert record.worked_ratio == Decimal("1.0000")
        assert record.late_minutes == 0
        assert record.early_departure_minutes == 0
        assert record.overtime_minutes == 0
        assert record.is_single_punch is False
        assert record.anomaly_code is None

        # Verify audit trace
        assert trace.trace_payload["work_mode"] == "ON_DUTY"
        assert trace.trace_payload["is_on_duty_waived"] is True


@pytest.mark.asyncio
async def test_wfh_mode_gated_overtime(seeded_tenants: tuple[Tenant, Tenant]):
    """BR-OTC-01 / Confirmed N20: Mode-Gated Overtime Controls.

    Extra minutes on a work-from-home day stay unpayable until a supervisor authorizes them.
    allow_wfh_overtime does not by itself write payable overtime.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)

        # Policy A: allow_wfh_overtime = False (default)
        pol_suppress = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"WFH_NO_OT_{uuid4().hex[:6].upper()}",
                name="WFH No OT Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                allow_wfh_overtime=False,
                ot_minimum_minutes=30,
            ),
        )
        # Policy B: allow_wfh_overtime = True
        pol_allow = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"WFH_ALLOW_OT_{uuid4().hex[:6].upper()}",
                name="WFH Allow OT Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                allow_wfh_overtime=True,
                ot_minimum_minutes=30,
            ),
        )

        # Create raw envelope for punches
        env = RawEnvelope(
            id=uuid4(),
            tenant_id=tenant.id,
            source="TEST",
            raw_payload={},
            payload_hash=f"hash_{uuid4().hex[:8]}",
            received_at=datetime.now(UTC),
        )
        session.add(env)
        await session.flush()

        # Day 1: 2026-11-12 with suppressed OT
        date_a = date(2026, 11, 12)
        # 10 hours worked: 09:00 (03:30 UTC) to 19:00 (13:30 UTC) -> 600m on 540m shift -> 60m extra
        p_in_a = datetime(2026, 11, 12, 3, 30, tzinfo=UTC)
        p_out_a = datetime(2026, 11, 12, 13, 30, tzinfo=UTC)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_in_a, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_out_a, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))

        # Approve WFH for date_a
        req_a = await apply_work_mode(session, tenant.id, emp.id, WorkModeApply(work_mode="WFH", calendar_date=date_a, session_target="FULL", reason="WFH day"))
        req_a.status = "APPROVED"

        # Day 2: 2026-11-13 with allowed OT
        date_b = date(2026, 11, 13)
        p_in_b = datetime(2026, 11, 13, 3, 30, tzinfo=UTC)
        p_out_b = datetime(2026, 11, 13, 13, 30, tzinfo=UTC)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_in_b, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_out_b, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))

        req_b = await apply_work_mode(session, tenant.id, emp.id, WorkModeApply(work_mode="WFH", calendar_date=date_b, session_target="FULL", reason="WFH day"))
        req_b.status = "APPROVED"

        await session.commit()
        await set_tenant(session, tenant.id)

        # Evaluate Day 1 under suppressed OT policy
        shift_a = ShiftInstanceContract(
            calendar_date=date_a,
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
            policy=pol_suppress,
        )
        rec_a, trace_a = await calculate_and_save_daily_attendance(
            session=session, tenant_id=tenant.id, employee_id=emp.id, calendar_date=date_a, shift_contract=shift_a
        )
        assert rec_a.worked_duration_minutes == 600
        assert rec_a.overtime_minutes == 0  # SUPPRESSED!
        assert trace_a.trace_payload["wfh_ot_suppressed"] is True

        # Evaluate Day 2 under allowed OT policy
        shift_b = ShiftInstanceContract(
            calendar_date=date_b,
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
            policy=pol_allow,
        )
        rec_b, trace_b = await calculate_and_save_daily_attendance(
            session=session, tenant_id=tenant.id, employee_id=emp.id, calendar_date=date_b, shift_contract=shift_b
        )
        assert rec_b.worked_duration_minutes == 600
        assert rec_b.overtime_minutes == 0
        assert trace_b.trace_payload["wfh_ot_suppressed"] is True
        assert trace_b.trace_payload["applied_policy"]["allow_wfh_overtime"] is True


@pytest.mark.asyncio
async def test_monthly_late_count_and_penalty(seeded_tenants: tuple[Tenant, Tenant]):
    """BR-ATT-18: Monthly Late Count & Penalty Action.

    Employees are allowed up to N late arrivals per calendar month.
    On the (N+1)th late arrival, the configured penalty action is triggered.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)

        pol = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"LATE_POL_{uuid4().hex[:6].upper()}",
                name="2-Late Allowance Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                max_free_lates_per_month=2,
                late_penalty_action="WARNING",
            ),
        )

        env = RawEnvelope(
            id=uuid4(),
            tenant_id=tenant.id,
            source="TEST",
            raw_payload={},
            payload_hash=f"hash_{uuid4().hex[:8]}",
            received_at=datetime.now(UTC),
        )
        session.add(env)
        await session.flush()

        # Day 1: Late by 15 mins (09:15 In, 18:00 Out)
        d1 = date(2026, 11, 5)
        p_in_1 = datetime(2026, 11, 5, 3, 45, tzinfo=UTC)
        p_out_1 = datetime(2026, 11, 5, 12, 30, tzinfo=UTC)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_in_1, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_out_1, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))

        # Day 2: Late by 20 mins (09:20 In, 18:00 Out)
        d2 = date(2026, 11, 6)
        p_in_2 = datetime(2026, 11, 6, 3, 50, tzinfo=UTC)
        p_out_2 = datetime(2026, 11, 6, 12, 30, tzinfo=UTC)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_in_2, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_out_2, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))

        # Day 3: Late by 25 mins (09:25 In, 18:00 Out)
        d3 = date(2026, 11, 7)
        p_in_3 = datetime(2026, 11, 7, 3, 55, tzinfo=UTC)
        p_out_3 = datetime(2026, 11, 7, 12, 30, tzinfo=UTC)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_in_3, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=p_out_3, source="TEST", status="ACTIVE", created_at=datetime.now(UTC)))

        await session.commit()
        await set_tenant(session, tenant.id)

        # Process Day 1: 1st late (prior = 0 < 2 -> no penalty)
        shift_1 = ShiftInstanceContract(
            calendar_date=d1,
            shift_type="FIXED",
            sessions=[SessionWindow(session_order=1, start_time=time(9, 0), end_time=time(18, 0), pre_window_minutes=60, post_window_minutes=120, min_presence_ratio=0.50, break_duration_minutes=0)],
            policy=pol,
        )
        rec1, trace1 = await calculate_and_save_daily_attendance(session=session, tenant_id=tenant.id, employee_id=emp.id, calendar_date=d1, shift_contract=shift_1)
        await session.commit()
        await set_tenant(session, tenant.id)
        assert rec1.late_minutes == 15
        assert rec1.anomaly_code is None
        assert trace1.trace_payload["late_penalty"]["exceeded"] is False
        assert trace1.trace_payload["late_penalty"]["prior_late_count"] == 0

        # Process Day 2: 2nd late (prior = 1 < 2 -> no penalty)
        shift_2 = ShiftInstanceContract(
            calendar_date=d2,
            shift_type="FIXED",
            sessions=[SessionWindow(session_order=1, start_time=time(9, 0), end_time=time(18, 0), pre_window_minutes=60, post_window_minutes=120, min_presence_ratio=0.50, break_duration_minutes=0)],
            policy=pol,
        )
        rec2, trace2 = await calculate_and_save_daily_attendance(session=session, tenant_id=tenant.id, employee_id=emp.id, calendar_date=d2, shift_contract=shift_2)
        await session.commit()
        await set_tenant(session, tenant.id)
        assert rec2.late_minutes == 20
        assert rec2.anomaly_code is None
        assert trace2.trace_payload["late_penalty"]["exceeded"] is False
        assert trace2.trace_payload["late_penalty"]["prior_late_count"] == 1

        # Process Day 3: 3rd late (prior = 2 >= 2 -> PENALTY TRIGGERED!)
        shift_3 = ShiftInstanceContract(
            calendar_date=d3,
            shift_type="FIXED",
            sessions=[SessionWindow(session_order=1, start_time=time(9, 0), end_time=time(18, 0), pre_window_minutes=60, post_window_minutes=120, min_presence_ratio=0.50, break_duration_minutes=0)],
            policy=pol,
        )
        rec3, trace3 = await calculate_and_save_daily_attendance(session=session, tenant_id=tenant.id, employee_id=emp.id, calendar_date=d3, shift_contract=shift_3)
        await session.commit()
        await set_tenant(session, tenant.id)
        assert rec3.late_minutes == 25
        assert rec3.anomaly_code == "LATE_PENALTY_WARNING"
        assert trace3.trace_payload["late_penalty"]["exceeded"] is True
        assert trace3.trace_payload["late_penalty"]["prior_late_count"] == 2
        assert trace3.trace_payload["late_penalty"]["penalty_action"] == "WARNING"


@pytest.mark.asyncio
async def test_work_mode_rls_isolation(seeded_tenants: tuple[Tenant, Tenant]):
    """Invariant 1: Multi-tenant RLS fail-closed isolation on work_mode_requests."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        emp_a = await _create_test_employee(session, tenant_a.id)

        req_a = await apply_work_mode(
            session,
            tenant_a.id,
            emp_a.id,
            WorkModeApply(
                work_mode="WFH",
                calendar_date=date(2026, 11, 20),
                session_target="FULL",
                reason="Tenant A isolated request",
            ),
        )
        await session.commit()
        req_id = req_a.id

    # Access from Tenant B session must return None
    async with SessionLocal() as session:
        await set_tenant(session, tenant_b.id)
        found = await get_work_mode_request(session, tenant_b.id, req_id)
        assert found is None


@pytest.mark.asyncio
async def test_ess_and_admin_api_endpoints():
    """Verify ESS and Admin Work Mode REST endpoints with RBAC enforcement."""
    emp_password = "ChangeMe-Emp-123!"
    emp_email = f"emp_ess_{uuid4().hex[:6]}@northmill.example"

    async with MigrateSession() as session:
        tenant_a = await session.scalar(select(Tenant).where(Tenant.subdomain == "northmill"))
        assert tenant_a is not None

        branch = await session.scalar(select(Branch).where(Branch.tenant_id == tenant_a.id))
        assert branch is not None
        emp_role = await session.scalar(select(Role).where(Role.tenant_id == tenant_a.id, Role.code == "EMPLOYEE"))
        assert emp_role is not None

        user_id = uuid4()
        now = datetime.now(UTC)
        user = User(
            id=user_id,
            tenant_id=tenant_a.id,
            email=emp_email,
            full_name="ESS Test Employee",
            hashed_password=hash_password(emp_password),
            is_active=True,
            created_at=now,
        )
        session.add(user)
        session.add(UserRole(id=uuid4(), tenant_id=tenant_a.id, user_id=user_id, role_id=emp_role.id))
        await session.flush()

        emp = Employee(
            id=uuid4(),
            tenant_id=tenant_a.id,
            branch_id=branch.id,
            user_id=user_id,
            employee_code=f"ESS_{uuid4().hex[:6].upper()}",
            full_name="ESS Test Employee",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        session.add(emp)
        await session.commit()

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthenticated -> 401
        resp = await client.get("/api/v1/work-modes/requests")
        assert resp.status_code == 401

        # 2. Employee login
        emp_login = await client.post(
            "/api/v1/auth/login",
            json={"email": emp_email, "password": emp_password},
        )
        assert emp_login.status_code == 200
        emp_token = emp_login.json()["access_token"]
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        # 3. Employee applies via ESS endpoint
        apply_resp = await client.post(
            "/api/v1/ess/work-modes/apply",
            headers=emp_headers,
            json={
                "work_mode": "WFH",
                "calendar_date": "2026-11-28",
                "session_target": "FULL",
                "reason": "Applying via ESS endpoint",
            },
        )
        assert apply_resp.status_code == 201
        created_data = apply_resp.json()
        assert created_data["work_mode"] == "WFH"
        req_id = created_data["id"]

        # 4. Employee views own requests via ESS
        my_reqs = await client.get("/api/v1/ess/work-modes/my-requests", headers=emp_headers)
        assert my_reqs.status_code == 200
        assert any(r["id"] == req_id for r in my_reqs.json())

        # 5. Employee cannot approve/review (no work_mode.request.review) -> 403
        rev_fail = await client.post(
            f"/api/v1/work-modes/requests/{req_id}/approve",
            headers=emp_headers,
            json={"decision_reason": "Self-approval attempt"},
        )
        assert rev_fail.status_code == 403

        # 6. Supervisor login
        sup_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "supervisor@northmill.example", "password": "ChangeMe-Supervisor-1"},
        )
        assert sup_login.status_code == 200
        sup_token = sup_login.json()["access_token"]
        sup_headers = {"Authorization": f"Bearer {sup_token}"}

        # 7. Supervisor views requests via admin endpoint
        admin_reqs = await client.get("/api/v1/work-modes/requests", headers=sup_headers)
        assert admin_reqs.status_code == 200
        assert any(r["id"] == req_id for r in admin_reqs.json())


def test_half_day_on_duty_waives_one_session_only():
    cal_date = date(2026, 11, 20)
    shift = ShiftInstanceContract(
        calendar_date=cal_date,
        shift_type="SPLIT",
        sessions=[
            SessionWindow(1, time(9, 0), time(13, 0), 30, 30, 0.5, 0),
            SessionWindow(2, time(14, 0), time(18, 0), 30, 30, 0.5, 0),
        ],
    )
    decision = evaluate_daily_rollup(
        pair_punches_for_shift(shift, []),
        work_mode="ON_DUTY",
        session_target="FIRST_HALF",
    )
    assert decision.worked_minutes == 240
    assert decision.status == "HALF_DAY"


def test_single_session_half_does_not_credit_a_full_day():
    cal_date = date(2026, 11, 20)
    shift = ShiftInstanceContract(
        calendar_date=cal_date,
        shift_type="FIXED",
        sessions=[SessionWindow(1, time(9, 0), time(18, 0), 60, 120, 0.5, 0)],
    )
    decision = evaluate_daily_rollup(
        pair_punches_for_shift(shift, []),
        work_mode="WFH",
        session_target="FIRST_HALF",
    )
    assert decision.worked_minutes == 270
    assert decision.status == "HALF_DAY"
    assert decision.overtime_minutes == 0


@pytest.mark.asyncio
async def test_late_penalty_posts_one_leave_ledger_row(seeded_tenants: tuple[Tenant, Tenant]):
    tenant, _ = seeded_tenants
    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)
        now = datetime.now(UTC)
        leave_type = LeaveType(
            id=uuid4(),
            tenant_id=tenant.id,
            code=f"LP_{uuid4().hex[:6].upper()}",
            name="Penalty leave",
            allow_negative_balance=False,
            sandwich_enabled=False,
        )
        session.add(leave_type)
        await session.flush()
        await insert_transaction(
            session,
            LeaveTransaction(
                id=uuid4(),
                tenant_id=tenant.id,
                employee_id=emp.id,
                leave_type_id=leave_type.id,
                calendar_date=None,
                entry_type="ACCRUAL",
                days=Decimal("1.0"),
                created_at=now,
            ),
        )
        policy = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"PEN_{uuid4().hex[:6].upper()}",
                name="Late penalty",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                max_free_lates_per_month=0,
                late_penalty_action="DEDUCT_LEAVE_HALF_DAY",
                late_penalty_leave_type_id=leave_type.id,
            ),
        )
        env = RawEnvelope(
            id=uuid4(),
            tenant_id=tenant.id,
            source="TEST",
            raw_payload={},
            payload_hash=f"hash_{uuid4().hex[:8]}",
            received_at=now,
        )
        session.add(env)
        await session.flush()
        day = date(2026, 11, 18)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=datetime(2026, 11, 18, 3, 45, tzinfo=UTC), source="TEST", status="ACTIVE", created_at=now))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=datetime(2026, 11, 18, 12, 30, tzinfo=UTC), source="TEST", status="ACTIVE", created_at=now))
        await session.commit()
        await set_tenant(session, tenant.id)

        shift = ShiftInstanceContract(
            calendar_date=day,
            shift_type="FIXED",
            sessions=[SessionWindow(1, time(9, 0), time(18, 0), 60, 120, 0.5, 0)],
            policy=policy,
        )
        await calculate_and_save_daily_attendance(session, tenant.id, emp.id, day, shift_contract=shift)
        await calculate_and_save_daily_attendance(session, tenant.id, emp.id, day, shift_contract=shift)
        await session.commit()
        await set_tenant(session, tenant.id)

        rows = [
            row
            for row in await list_transactions(session, tenant.id, emp.id)
            if row.session_target == "LATE_PENALTY"
        ]
        assert len(rows) == 1
        assert rows[0].entry_type == "DEBIT"
        assert rows[0].days == Decimal("0.5")
        current = balance(
            [
                (row.entry_type, Decimal(row.days))
                for row in await list_transactions(session, tenant.id, emp.id)
                if row.leave_type_id == leave_type.id
            ]
        )
        assert current == Decimal("0.5")

        policy.late_penalty_action = "LOSS_OF_PAY"
        await session.flush()
        next_day = date(2026, 11, 19)
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=datetime(2026, 11, 19, 3, 50, tzinfo=UTC), source="TEST", status="ACTIVE", created_at=now))
        session.add(PunchEvent(id=uuid4(), tenant_id=tenant.id, raw_envelope_id=env.id, employee_id=emp.id, punch_time=datetime(2026, 11, 19, 12, 30, tzinfo=UTC), source="TEST", status="ACTIVE", created_at=now))
        shift_next = ShiftInstanceContract(
            calendar_date=next_day,
            shift_type="FIXED",
            sessions=[SessionWindow(1, time(9, 0), time(18, 0), 60, 120, 0.5, 0)],
            policy=policy,
        )
        await calculate_and_save_daily_attendance(session, tenant.id, emp.id, next_day, shift_contract=shift_next)
        await session.commit()
        await set_tenant(session, tenant.id)
        penalty_rows = [
            row
            for row in await list_transactions(session, tenant.id, emp.id)
            if row.session_target == "LATE_PENALTY" and row.calendar_date == next_day
        ]
        assert len(penalty_rows) == 1
        assert penalty_rows[0].entry_type == "LOP"
        still = balance(
            [
                (row.entry_type, Decimal(row.days))
                for row in await list_transactions(session, tenant.id, emp.id)
                if row.leave_type_id == leave_type.id
            ]
        )
        assert still == Decimal("0.5")

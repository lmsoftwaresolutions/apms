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
from app.models.attendance import AttendanceDailyRecord
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Role, Tenant, User, UserRole
from app.models.leave import LeaveTransaction, LeaveType
from app.models.overtime import OvertimeRecord
from app.models.policy import PolicyMaster
from app.models.roster import DatedShiftInstance
from app.models.shift import ShiftTemplate
from app.modules.attendance.engine.contracts import SessionWindow, ShiftInstanceContract
from app.modules.attendance.service import calculate_and_save_daily_attendance
from app.modules.overtime.repository import get_overtime_record, list_overtime_records
from app.modules.overtime.schemas import (
    OvertimeApproveRequest,
    OvertimeConvertCompOffRequest,
    OvertimeRejectRequest,
)
from app.modules.overtime.service import (
    approve_overtime,
    convert_to_compoff,
    reject_overtime,
)
from app.modules.policies.schemas import PolicyCreate
from app.modules.policies.service import create_policy


async def _link_policy(session, tenant_id, employee_id, policy_id, *days: date) -> None:
    now = datetime.now(UTC)
    template = ShiftTemplate(
        id=uuid4(),
        tenant_id=tenant_id,
        policy_id=policy_id,
        code=f"OT_{uuid4().hex[:6].upper()}",
        name="Overtime policy shift",
        shift_type="FIXED",
        created_at=now,
        updated_at=now,
    )
    session.add(template)
    await session.flush()
    for day in days:
        session.add(
            DatedShiftInstance(
                id=uuid4(),
                tenant_id=tenant_id,
                employee_id=employee_id,
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
        employee_code=f"OT_{uuid4().hex[:6].upper()}",
        full_name="Overtime Test Employee",
        date_of_joining=date(2026, 1, 1),
        is_active=True,
        created_at=datetime.now(UTC),
        updated_at=datetime.now(UTC),
    )
    session.add(emp)
    await session.flush()
    return emp


async def _create_attendance_record(session, tenant_id, employee_id, cal_date: date) -> AttendanceDailyRecord:
    now = datetime.now(UTC)
    att = AttendanceDailyRecord(
        id=uuid4(),
        tenant_id=tenant_id,
        employee_id=employee_id,
        calendar_date=cal_date,
        dated_shift_instance_id=None,
        status="PRESENT",
        worked_duration_minutes=540,
        scheduled_duration_minutes=480,
        worked_ratio=Decimal("1.0000"),
        late_minutes=0,
        early_departure_minutes=0,
        overtime_minutes=60,
        is_single_punch=False,
        anomaly_code=None,
        created_at=now,
        updated_at=now,
    )
    session.add(att)
    await session.flush()
    return att


async def _create_punches(session, tenant_id, employee_id, punches: list[datetime]) -> RawEnvelope:
    env = RawEnvelope(
        id=uuid4(),
        tenant_id=tenant_id,
        source="TEST",
        raw_payload={},
        payload_hash=f"hash_{uuid4().hex[:8]}",
        received_at=datetime.now(UTC),
    )
    session.add(env)
    await session.flush()

    for p in punches:
        session.add(
            PunchEvent(
                id=uuid4(),
                tenant_id=tenant_id,
                raw_envelope_id=env.id,
                employee_id=employee_id,
                punch_time=p,
                source="TEST",
                status="ACTIVE",
                created_at=datetime.now(UTC),
            )
        )
    await session.flush()
    return env


@pytest.mark.asyncio
async def test_overtime_approval_modes_in_attendance_rollup(seeded_tenants: tuple[Tenant, Tenant]):
    """Test attendance rollup generating OvertimeRecord across all policy approval modes."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)

        # 1. AUTO_APPROVE_ALL: 10 hrs worked on 9 hr shift -> 60 mins OT
        pol_auto_all = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"OT_ALL_{uuid4().hex[:6].upper()}",
                name="OT Auto Approve All Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                allow_overtime=True,
                ot_multiplier=Decimal("1.50"),
                overtime_auto_approval_enabled=True,
                ot_approval_mode="AUTO_APPROVE_ALL",
                ot_minimum_minutes=30,
            ),
        )
        d1 = date(2026, 11, 2)
        # Shift 09:00 - 18:00 (540m). Punches: 09:00 (03:30 UTC) to 19:00 (13:30 UTC) -> 600m -> 60m OT
        await _create_punches(
            session,
            tenant.id,
            emp.id,
            [
                datetime(2026, 11, 2, 3, 30, tzinfo=UTC),
                datetime(2026, 11, 2, 13, 30, tzinfo=UTC),
            ],
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        shift_1 = ShiftInstanceContract(
            calendar_date=d1,
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
            policy=pol_auto_all,
        )
        rec1, trace1 = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=d1,
            shift_contract=shift_1,
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert rec1.overtime_minutes == 60
        ot_rec1 = await session.scalar(
            select(OvertimeRecord).where(
                OvertimeRecord.tenant_id == tenant.id,
                OvertimeRecord.attendance_record_id == rec1.id,
            )
        )
        assert ot_rec1 is not None
        assert ot_rec1.status == "APPROVED_FOR_PAY"
        assert ot_rec1.raw_overtime_minutes == 60
        assert ot_rec1.approved_overtime_minutes == 60
        assert trace1.trace_payload["applied_policy"]["ot_approval_mode"] == "AUTO_APPROVE_ALL"
        assert trace1.trace_payload["summary"]["overtime_minutes"] == 60

        # 2. ALWAYS_REQUIRE_APPROVAL: 60 mins OT -> enters UNREVIEWED with approved_minutes = 0
        pol_req_appr = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"OT_REQ_{uuid4().hex[:6].upper()}",
                name="OT Require Approval Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                allow_overtime=True,
                ot_multiplier=Decimal("1.50"),
                ot_approval_mode="ALWAYS_REQUIRE_APPROVAL",
                ot_minimum_minutes=30,
            ),
        )
        d2 = date(2026, 11, 3)
        await _create_punches(
            session,
            tenant.id,
            emp.id,
            [
                datetime(2026, 11, 3, 3, 30, tzinfo=UTC),
                datetime(2026, 11, 3, 13, 30, tzinfo=UTC),
            ],
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        shift_2 = ShiftInstanceContract(
            calendar_date=d2,
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
            policy=pol_req_appr,
        )
        rec2, trace2 = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=d2,
            shift_contract=shift_2,
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert rec2.overtime_minutes == 60
        ot_rec2 = await session.scalar(
            select(OvertimeRecord).where(
                OvertimeRecord.tenant_id == tenant.id,
                OvertimeRecord.attendance_record_id == rec2.id,
            )
        )
        assert ot_rec2 is not None
        assert ot_rec2.status == "UNREVIEWED"
        assert ot_rec2.raw_overtime_minutes == 60
        assert ot_rec2.approved_overtime_minutes == 0
        assert trace2.trace_payload["applied_policy"]["ot_approval_mode"] == "ALWAYS_REQUIRE_APPROVAL"
        assert trace2.trace_payload["summary"]["overtime_minutes"] == 60

        # 3. AUTO_APPROVE_BELOW_THRESHOLD: threshold = 60 mins
        pol_thresh = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"OT_THR_{uuid4().hex[:6].upper()}",
                name="OT Threshold Policy",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                allow_overtime=True,
                ot_multiplier=Decimal("1.50"),
                overtime_auto_approval_enabled=True,
                ot_approval_mode="AUTO_APPROVE_BELOW_THRESHOLD",
                ot_auto_approve_threshold_minutes=60,
                ot_minimum_minutes=30,
            ),
        )

        # 3a. 45 mins OT (<= 60) -> Auto-approved
        d3a = date(2026, 11, 4)
        # 09:00 to 18:45 -> 585m -> 45m OT
        await _create_punches(
            session,
            tenant.id,
            emp.id,
            [
                datetime(2026, 11, 4, 3, 30, tzinfo=UTC),
                datetime(2026, 11, 4, 13, 15, tzinfo=UTC),
            ],
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        shift_3a = ShiftInstanceContract(
            calendar_date=d3a,
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
            policy=pol_thresh,
        )
        rec3a, trace3a = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=d3a,
            shift_contract=shift_3a,
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert rec3a.overtime_minutes == 45
        ot_rec3a = await session.scalar(
            select(OvertimeRecord).where(
                OvertimeRecord.tenant_id == tenant.id,
                OvertimeRecord.attendance_record_id == rec3a.id,
            )
        )
        assert ot_rec3a is not None
        assert ot_rec3a.status == "APPROVED_FOR_PAY"
        assert ot_rec3a.approved_overtime_minutes == 45
        assert trace3a.trace_payload["applied_policy"]["ot_approval_mode"] == "AUTO_APPROVE_BELOW_THRESHOLD"
        assert trace3a.trace_payload["summary"]["overtime_minutes"] == 45

        # 3b. 90 mins OT (> 60) -> Stays UNREVIEWED
        d3b = date(2026, 11, 5)
        # 09:00 to 19:30 -> 630m -> 90m OT
        await _create_punches(
            session,
            tenant.id,
            emp.id,
            [
                datetime(2026, 11, 5, 3, 30, tzinfo=UTC),
                datetime(2026, 11, 5, 14, 0, tzinfo=UTC),
            ],
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        shift_3b = ShiftInstanceContract(
            calendar_date=d3b,
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
            policy=pol_thresh,
        )
        rec3b, trace3b = await calculate_and_save_daily_attendance(
            session=session,
            tenant_id=tenant.id,
            employee_id=emp.id,
            calendar_date=d3b,
            shift_contract=shift_3b,
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert rec3b.overtime_minutes == 90
        ot_rec3b = await session.scalar(
            select(OvertimeRecord).where(
                OvertimeRecord.tenant_id == tenant.id,
                OvertimeRecord.attendance_record_id == rec3b.id,
            )
        )
        assert ot_rec3b is not None
        assert ot_rec3b.status == "UNREVIEWED"
        assert ot_rec3b.approved_overtime_minutes == 0
        assert trace3b.trace_payload["applied_policy"]["ot_approval_mode"] == "AUTO_APPROVE_BELOW_THRESHOLD"
        assert trace3b.trace_payload["summary"]["overtime_minutes"] == 90


@pytest.mark.asyncio
async def test_overtime_supervisor_review_and_rejection(seeded_tenants: tuple[Tenant, Tenant]):
    """Test supervisor approval and rejection flows with decision reasons."""
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)
        admin_user = await session.scalar(select(User).where(User.tenant_id == tenant.id))
        assert admin_user is not None

        # Create attendance record and unreviewed overtime record
        d1 = date(2026, 11, 10)
        att1 = await _create_attendance_record(session, tenant.id, emp.id, d1)
        rec_id = uuid4()
        rec = OvertimeRecord(
            id=rec_id,
            tenant_id=tenant.id,
            employee_id=emp.id,
            attendance_record_id=att1.id,
            overtime_date=d1,
            raw_overtime_minutes=120,
            approved_overtime_minutes=0,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec)
        await session.commit()
        await set_tenant(session, tenant.id)

        # 1. Supervisor approves 120 mins
        approved = await approve_overtime(
            session,
            tenant.id,
            rec_id,
            approved_minutes=120,
            supervisor_id=admin_user.id,
            decision_reason="Approved production surge OT",
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert approved.status == "APPROVED_FOR_PAY"
        assert approved.approved_overtime_minutes == 120
        assert approved.supervisor_id == admin_user.id
        assert approved.decision_reason == "Approved production surge OT"
        assert approved.reviewed_at is not None

        # 2. Rejection flow (requires decision reason)
        d2 = date(2026, 11, 11)
        att2 = await _create_attendance_record(session, tenant.id, emp.id, d2)
        rec2_id = uuid4()
        rec2 = OvertimeRecord(
            id=rec2_id,
            tenant_id=tenant.id,
            employee_id=emp.id,
            attendance_record_id=att2.id,
            overtime_date=d2,
            raw_overtime_minutes=60,
            approved_overtime_minutes=0,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec2)
        await session.commit()
        await set_tenant(session, tenant.id)

        # Reject without reason -> 422
        with pytest.raises(ProblemError) as exc_info:
            await reject_overtime(
                session,
                tenant.id,
                rec2_id,
                supervisor_id=admin_user.id,
                decision_reason="",
            )
        assert exc_info.value.status == 422

        # Reject with valid reason
        rejected = await reject_overtime(
            session,
            tenant.id,
            rec2_id,
            supervisor_id=admin_user.id,
            decision_reason="Unauthorized post-shift stay",
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert rejected.status == "REJECTED"
        assert rejected.approved_overtime_minutes == 0
        assert rejected.decision_reason == "Unauthorized post-shift stay"


@pytest.mark.asyncio
async def test_overtime_convert_to_compoff_double_entry(seeded_tenants: tuple[Tenant, Tenant]):
    """Invariant 3: Double-entry leave ledger credit for Comp-Off conversion.

    480 minutes OT -> exact +1.0 day credit in leave_transactions table.
    240 minutes OT -> exact +0.5 day credit.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)
        admin_user = await session.scalar(select(User).where(User.tenant_id == tenant.id))
        assert admin_user is not None
        comp_policy = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"COMP_{uuid4().hex[:6].upper()}",
                name="Comp-off day length",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                comp_off_minutes_per_day=480,
            ),
        )
        await _link_policy(session, tenant.id, emp.id, comp_policy.id, date(2026, 11, 15), date(2026, 11, 16))

        # 1. 480 mins (8 hours) -> 1.0 day comp-off
        d1 = date(2026, 11, 15)
        att1 = await _create_attendance_record(session, tenant.id, emp.id, d1)
        rec1_id = uuid4()
        rec1 = OvertimeRecord(
            id=rec1_id,
            tenant_id=tenant.id,
            employee_id=emp.id,
            attendance_record_id=att1.id,
            overtime_date=d1,
            raw_overtime_minutes=480,
            approved_overtime_minutes=480,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec1)
        await session.commit()
        await set_tenant(session, tenant.id)

        converted1 = await convert_to_compoff(
            session,
            tenant.id,
            rec1_id,
            supervisor_id=admin_user.id,
            decision_reason="Weekend maintenance coverage",
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert converted1.status == "CONVERTED_TO_COMPOFF"
        assert converted1.comp_off_leave_transaction_id is not None

        # Verify double-entry leave ledger transaction
        tx1 = await session.scalar(
            select(LeaveTransaction).where(LeaveTransaction.id == converted1.comp_off_leave_transaction_id)
        )
        assert tx1 is not None
        assert tx1.tenant_id == tenant.id
        assert tx1.employee_id == emp.id
        assert tx1.entry_type == "CREDIT"
        assert tx1.days == Decimal("1.0")

        # Verify COMP_OFF leave type linked
        lt = await session.scalar(select(LeaveType).where(LeaveType.id == tx1.leave_type_id))
        assert lt is not None
        assert lt.code == "COMP_OFF"

        # 2. 240 mins (4 hours) -> 0.5 day comp-off
        d2 = date(2026, 11, 16)
        att2 = await _create_attendance_record(session, tenant.id, emp.id, d2)
        rec2_id = uuid4()
        rec2 = OvertimeRecord(
            id=rec2_id,
            tenant_id=tenant.id,
            employee_id=emp.id,
            attendance_record_id=att2.id,
            overtime_date=d2,
            raw_overtime_minutes=240,
            approved_overtime_minutes=240,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec2)
        await session.commit()
        await set_tenant(session, tenant.id)

        converted2 = await convert_to_compoff(
            session,
            tenant.id,
            rec2_id,
            supervisor_id=admin_user.id,
            decision_reason="Half shift extra",
        )
        await session.commit()
        await set_tenant(session, tenant.id)

        assert converted2.status == "CONVERTED_TO_COMPOFF"
        tx2 = await session.scalar(
            select(LeaveTransaction).where(LeaveTransaction.id == converted2.comp_off_leave_transaction_id)
        )
        assert tx2 is not None
        assert tx2.days == Decimal("0.5")


@pytest.mark.asyncio
async def test_statutory_quarterly_cap_enforcement(seeded_tenants: tuple[Tenant, Tenant]):
    """Invariant 5: Statutory quarterly OT cap (125 hours = 7500 minutes) parameterization.

    Approving OT that causes total quarterly approved OT to exceed the policy cap raises 422.
    """
    tenant, _ = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant.id)
        emp = await _create_test_employee(session, tenant.id)
        admin_user = await session.scalar(select(User).where(User.tenant_id == tenant.id))
        assert admin_user is not None
        cap_policy = await create_policy(
            session,
            tenant.id,
            PolicyCreate(
                code=f"CAP_{uuid4().hex[:6].upper()}",
                name="Quarterly cap",
                half_day_work_duration_minutes=240,
                full_day_work_duration_minutes=540,
                quarterly_ot_cap_minutes=7500,
            ),
        )
        await _link_policy(session, tenant.id, emp.id, cap_policy.id, date(2026, 11, 1), date(2026, 11, 20))

        # Existing approved OT in Q4 (Nov 2026): 7440 mins (124 hours)
        d_base = date(2026, 11, 1)
        att_base = await _create_attendance_record(session, tenant.id, emp.id, d_base)
        rec_base = OvertimeRecord(
            id=uuid4(),
            tenant_id=tenant.id,
            employee_id=emp.id,
            attendance_record_id=att_base.id,
            overtime_date=d_base,
            raw_overtime_minutes=7440,
            approved_overtime_minutes=7440,
            status="APPROVED_FOR_PAY",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec_base)

        # New unreviewed record for 120 mins (7440 + 120 = 7560 > 7500 -> 126 hours)
        d_new = date(2026, 11, 20)
        att_new = await _create_attendance_record(session, tenant.id, emp.id, d_new)
        rec_new_id = uuid4()
        rec_new = OvertimeRecord(
            id=rec_new_id,
            tenant_id=tenant.id,
            employee_id=emp.id,
            attendance_record_id=att_new.id,
            overtime_date=d_new,
            raw_overtime_minutes=120,
            approved_overtime_minutes=0,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec_new)
        await session.commit()
        await set_tenant(session, tenant.id)

        # Attempting to approve 120 mins must fail with 422 statutory cap exceeded
        with pytest.raises(ProblemError) as exc_info:
            await approve_overtime(
                session,
                tenant.id,
                rec_new_id,
                approved_minutes=120,
                supervisor_id=admin_user.id,
            )
        assert exc_info.value.status == 422
        assert "quarterly overtime cap of 7500 minutes" in exc_info.value.detail

        # Approving 60 mins (7440 + 60 = 7500 == 125 hours) must succeed
        approved = await approve_overtime(
            session,
            tenant.id,
            rec_new_id,
            approved_minutes=60,
            supervisor_id=admin_user.id,
        )
        assert approved.status == "APPROVED_FOR_PAY"
        assert approved.approved_overtime_minutes == 60


@pytest.mark.asyncio
async def test_overtime_rls_isolation(seeded_tenants: tuple[Tenant, Tenant]):
    """Invariant 1: Multi-tenant RLS fail-closed isolation on overtime_records."""
    tenant_a, tenant_b = seeded_tenants

    async with SessionLocal() as session:
        await set_tenant(session, tenant_a.id)
        emp_a = await _create_test_employee(session, tenant_a.id)

        d_a = date(2026, 11, 10)
        att_a = await _create_attendance_record(session, tenant_a.id, emp_a.id, d_a)
        rec_a = OvertimeRecord(
            id=uuid4(),
            tenant_id=tenant_a.id,
            employee_id=emp_a.id,
            attendance_record_id=att_a.id,
            overtime_date=d_a,
            raw_overtime_minutes=120,
            approved_overtime_minutes=0,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=datetime.now(UTC),
            updated_at=datetime.now(UTC),
        )
        session.add(rec_a)
        await session.commit()
        rec_id = rec_a.id

    # Tenant B query must return None
    async with SessionLocal() as session:
        await set_tenant(session, tenant_b.id)
        found = await get_overtime_record(session, tenant_b.id, rec_id)
        assert found is None

        # Tenant B list query must not include Tenant A's record
        records_b = await list_overtime_records(session, tenant_b.id)
        assert not any(r.id == rec_id for r in records_b)


@pytest.mark.asyncio
async def test_overtime_rest_api_and_ess():
    """Verify Overtime REST API endpoints for Supervisor review and Employee ESS view."""
    emp_password = "ChangeMe-Emp-123!"
    emp_email = f"emp_ot_{uuid4().hex[:6]}@northmill.example"

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
            full_name="ESS Overtime Employee",
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
            employee_code=f"ESS_OT_{uuid4().hex[:6].upper()}",
            full_name="ESS Overtime Employee",
            date_of_joining=date(2026, 1, 1),
            is_active=True,
            created_at=now,
            updated_at=now,
        )
        session.add(emp)
        await session.flush()

        d_api = date(2026, 11, 12)
        att_api = await _create_attendance_record(session, tenant_a.id, emp.id, d_api)
        ot_rec = OvertimeRecord(
            id=uuid4(),
            tenant_id=tenant_a.id,
            employee_id=emp.id,
            attendance_record_id=att_api.id,
            overtime_date=d_api,
            raw_overtime_minutes=120,
            approved_overtime_minutes=0,
            status="UNREVIEWED",
            rate_multiplier=Decimal("2.00"),
            created_at=now,
            updated_at=now,
        )
        session.add(ot_rec)
        await session.commit()
        ot_id = ot_rec.id

    transport = ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
        # 1. Unauthenticated -> 401
        resp = await client.get("/api/v1/attendance/overtime/pending")
        assert resp.status_code == 401

        # 2. Employee login
        emp_login = await client.post(
            "/api/v1/auth/login",
            json={"email": emp_email, "password": emp_password},
        )
        assert emp_login.status_code == 200
        emp_token = emp_login.json()["access_token"]
        emp_headers = {"Authorization": f"Bearer {emp_token}"}

        # 3. Employee views own overtime records via ESS endpoint
        ess_resp = await client.get("/api/v1/ess/overtime/my-records", headers=emp_headers)
        assert ess_resp.status_code == 200
        ess_records = ess_resp.json()
        assert any(r["id"] == str(ot_id) for r in ess_records)

        # 4. Employee cannot approve (lacks overtime_record:update) -> 403
        approve_fail = await client.post(
            f"/api/v1/attendance/overtime/{ot_id}/approve",
            headers=emp_headers,
            json={"approved_minutes": 120},
        )
        assert approve_fail.status_code == 403

        # 5. Supervisor login
        sup_login = await client.post(
            "/api/v1/auth/login",
            json={"email": "supervisor@northmill.example", "password": "ChangeMe-Supervisor-1"},
        )
        assert sup_login.status_code == 200
        sup_token = sup_login.json()["access_token"]
        sup_headers = {"Authorization": f"Bearer {sup_token}"}

        # 6. Supervisor lists pending overtime
        pending_resp = await client.get("/api/v1/attendance/overtime/pending", headers=sup_headers)
        assert pending_resp.status_code == 200
        assert any(r["id"] == str(ot_id) for r in pending_resp.json())

        # 7. Supervisor gets overtime detail with quarterly cap info
        detail_resp = await client.get(f"/api/v1/attendance/overtime/{ot_id}", headers=sup_headers)
        assert detail_resp.status_code == 200
        detail_data = detail_resp.json()
        assert detail_data["quarterly_ot_cap_minutes"] == 7500
        assert detail_data["quarterly_ot_minutes_used"] == 0

        # 8. Supervisor approves overtime
        approve_resp = await client.post(
            f"/api/v1/attendance/overtime/{ot_id}/approve",
            headers=sup_headers,
            json={"approved_minutes": 120, "decision_reason": "Approved by supervisor"},
        )
        assert approve_resp.status_code == 200
        assert approve_resp.json()["status"] == "APPROVED_FOR_PAY"
        assert approve_resp.json()["approved_overtime_minutes"] == 120

        # 9. Supervisor converts overtime to comp-off
        convert_resp = await client.post(
            f"/api/v1/attendance/overtime/{ot_id}/convert-compoff",
            headers=sup_headers,
            json={"decision_reason": "Convert to comp-off at employee request"},
        )
        assert convert_resp.status_code == 200
        assert convert_resp.json()["status"] == "CONVERTED_TO_COMPOFF"
        assert convert_resp.json()["comp_off_leave_transaction_id"] is not None

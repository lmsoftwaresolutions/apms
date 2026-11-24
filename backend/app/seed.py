import asyncio
from datetime import UTC, datetime
from decimal import Decimal
from uuid import uuid4

from sqlalchemy import select, text

from app.core.database import MigrateSession
from app.core.security import hash_password
from app.models.branch import Branch
from app.models.iam import Permission, Role, RolePermission, Tenant, User, UserRole
from app.models.policy import PolicyMaster
from app.models.shift import ShiftTemplate
from app.modules.departments.repository import get_department_by_code
from app.modules.departments.schemas import DepartmentCreate
from app.modules.departments.service import create_department

PASSWORD = "ChangeMe-Admin-1"
SUPERVISOR_PASSWORD = "ChangeMe-Supervisor-1"

TENANTS = (
    {
        "name": "North Mill",
        "subdomain": "northmill",
        "display_name": "North Mill",
        "users": (
            ("admin@northmill.example", "North Mill Admin", PASSWORD, "TENANT_ADMIN"),
            ("supervisor@northmill.example", "Shift Supervisor", SUPERVISOR_PASSWORD, "SUPERVISOR"),
        ),
        "branch": ("Main Gate", "MAIN"),
        "departments": (("Spinning", "SPIN"), ("Weaving", "WEAV")),
    },
    {
        "name": "South Mill",
        "subdomain": "southmill",
        "display_name": "South Mill",
        "users": (("admin@southmill.example", "South Mill Admin", PASSWORD, "TENANT_ADMIN"),),
        "branch": ("Dock", "DOCK"),
        "departments": (("Logistics", "LOG"),),
    },
)

ROLE_NAMES = {
    "TENANT_ADMIN": "Tenant admin",
    "SUPERVISOR": "Shift supervisor",
    "EMPLOYEE": "Employee",
}


async def seed() -> None:
    async with MigrateSession() as session:
        privileged = await session.scalar(
            text("SELECT rolsuper OR rolbypassrls FROM pg_roles WHERE rolname = current_user")
        )
        if not privileged:
            raise SystemExit("DATABASE_URL_MIGRATE must be a superuser or BYPASSRLS role so seed can see every tenant.")

        catalog = list((await session.scalars(select(Permission))).all())
        by_code = {row.code: row for row in catalog}
        bundles = {
            "TENANT_ADMIN": list(by_code),
            "SUPERVISOR": [
                "org.branch.read",
                "org.branch.update",
                "org.department.read",
                "org.department.update",
                "org.designation.read",
                "org.designation.update",
                "attendance.regularization.create",
                "attendance.regularization.read",
                "attendance.regularization.review",
                "attendance.rollup.read",
                "leave.holiday.manage",
                "leave.request.read",
                "leave.request.review",
                "muster.export.read",
                "policy.master.read",
            ],
            "EMPLOYEE": [
                "org.branch.read",
                "org.department.read",
                "org.designation.read",
                "ess.calendar.read",
                "attendance.regularization.create",
                "attendance.regularization.read",
                "leave.request.create",
                "leave.request.read",
            ],
        }

        for spec in TENANTS:
            tenant = await session.scalar(select(Tenant).where(Tenant.subdomain == spec["subdomain"]))
            if tenant is None:
                tenant = Tenant(
                    id=uuid4(),
                    name=spec["name"],
                    subdomain=spec["subdomain"],
                    display_name=spec["display_name"],
                    logo_url=None,
                    is_active=True,
                    created_at=datetime.now(UTC),
                )
                session.add(tenant)
                await session.flush()

            roles: dict[str, Role] = {}
            for code, name in ROLE_NAMES.items():
                role = await session.scalar(select(Role).where(Role.tenant_id == tenant.id, Role.code == code))
                if role is None:
                    role = Role(
                        id=uuid4(),
                        tenant_id=tenant.id,
                        code=code,
                        name=name,
                        is_system=True,
                        created_at=tenant.created_at,
                    )
                    session.add(role)
                    await session.flush()
                roles[code] = role

                existing_perm_ids = set(
                    (
                        await session.scalars(
                            select(RolePermission.permission_id).where(
                                RolePermission.tenant_id == tenant.id,
                                RolePermission.role_id == role.id,
                            )
                        )
                    ).all()
                )
                for permission_code in bundles[code]:
                    if permission_code in by_code and by_code[permission_code].id not in existing_perm_ids:
                        session.add(
                            RolePermission(
                                id=uuid4(),
                                tenant_id=tenant.id,
                                role_id=role.id,
                                permission_id=by_code[permission_code].id,
                            )
                        )

            for email, full_name, password, role_code in spec["users"]:
                user = await session.scalar(select(User).where(User.email == email))
                if user is None:
                    user = User(
                        id=uuid4(),
                        tenant_id=tenant.id,
                        email=email,
                        full_name=full_name,
                        hashed_password=hash_password(password),
                        is_active=True,
                        created_at=tenant.created_at,
                    )
                    session.add(user)
                    await session.flush()
                    session.add(UserRole(id=uuid4(), tenant_id=tenant.id, user_id=user.id, role_id=roles[role_code].id))

            branch_name, branch_code = spec["branch"]
            existing_branch = await session.scalar(
                select(Branch).where(Branch.tenant_id == tenant.id, Branch.code == branch_code)
            )
            if existing_branch is None:
                existing_branch = Branch(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    name=branch_name,
                    code=branch_code,
                    is_active=True,
                    created_at=tenant.created_at,
                )
                session.add(existing_branch)
                await session.flush()

            for dept_name, dept_code in spec.get("departments", ()):
                existing_dept = await get_department_by_code(session, tenant.id, existing_branch.id, dept_code)
                if existing_dept is None:
                    await create_department(
                        session,
                        tenant.id,
                        DepartmentCreate(branch_id=existing_branch.id, name=dept_name, code=dept_code),
                    )

            # Seed GENERAL_POLICY and link unlinked shifts
            existing_policy = await session.scalar(
                select(PolicyMaster).where(PolicyMaster.tenant_id == tenant.id, PolicyMaster.code == "GENERAL_POLICY")
            )
            if existing_policy is None:
                existing_policy = PolicyMaster(
                    id=uuid4(),
                    tenant_id=tenant.id,
                    code="GENERAL_POLICY",
                    name="General Attendance Policy",
                    description="Standard factory attendance policy with 15-min late grace and 10-min early departure grace",
                    is_active=True,
                    late_arrival_allow_minutes=15,
                    early_departure_allow_minutes=10,
                    early_arrival_ignore_minutes=0,
                    late_departure_ignore_minutes=0,
                    half_day_work_duration_minutes=240,
                    full_day_work_duration_minutes=480,
                    half_day_late_cutoff_minutes=120,
                    absent_late_cutoff_minutes=240,
                    ot_minimum_minutes=30,
                    ot_multiplier=Decimal("1.50"),
                    max_ot_minutes_per_day=None,
                    in_out_rule="FIRST_IN_LAST_OUT",
                    created_at=tenant.created_at,
                    updated_at=tenant.created_at,
                )
                session.add(existing_policy)
                await session.flush()

            unlinked_shifts = (
                await session.scalars(
                    select(ShiftTemplate).where(
                        ShiftTemplate.tenant_id == tenant.id,
                        ShiftTemplate.policy_id.is_(None),
                    )
                )
            ).all()
            for s in unlinked_shifts:
                s.policy_id = existing_policy.id

        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())

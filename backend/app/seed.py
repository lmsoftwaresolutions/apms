import asyncio
from datetime import UTC, datetime
from uuid import uuid4

from sqlalchemy import select, text

from app.core.database import MigrateSession
from app.core.security import hash_password
from app.models.branch import Branch
from app.models.department import Department
from app.models.iam import Permission, Role, RolePermission, Tenant, User, UserRole

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
                "employee.employee.read",
                "capture.punch.read",
                "attendance.daily.read",
                "attendance.daily.recalculate",
                "attendance.trace.read",
            ],
            "EMPLOYEE": [
                "org.branch.read",
                "org.department.read",
                "employee.employee.read",
                "attendance.daily.read",
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
                    perm = by_code.get(permission_code)
                    if perm and perm.id not in existing_perm_ids:
                        session.add(
                            RolePermission(
                                id=uuid4(),
                                tenant_id=tenant.id,
                                role_id=role.id,
                                permission_id=perm.id,
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
                existing_dept = await session.scalar(
                    select(Department).where(
                        Department.tenant_id == tenant.id,
                        Department.branch_id == existing_branch.id,
                        Department.code == dept_code,
                    )
                )
                if existing_dept is None:
                    session.add(
                        Department(
                            id=uuid4(),
                            tenant_id=tenant.id,
                            branch_id=existing_branch.id,
                            name=dept_name,
                            code=dept_code,
                            is_active=True,
                            created_at=tenant.created_at,
                        )
                    )

        await session.commit()


if __name__ == "__main__":
    asyncio.run(seed())

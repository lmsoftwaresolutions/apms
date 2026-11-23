from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.core.security import hash_password
from app.models.branch import Branch
from app.models.employee import Employee
from app.models.iam import Permission, Role, RolePermission, Tenant, User, UserRole
from app.modules.platform.schemas import TenantListItem, TenantProvisionRequest

ROLE_NAMES = {
    "TENANT_ADMIN": "Tenant admin",
    "SUPERVISOR": "Shift supervisor",
    "EMPLOYEE": "Employee",
}


async def list_tenants(session: AsyncSession) -> list[TenantListItem]:
    tenants = (await session.scalars(select(Tenant).order_by(Tenant.created_at.desc()))).all()

    # Aggregate employee and branch counts across tenants
    emp_counts = dict(
        (
            await session.execute(
                select(Employee.tenant_id, func.count(Employee.id)).group_by(Employee.tenant_id)
            )
        ).all()
    )

    branch_counts = dict(
        (
            await session.execute(
                select(Branch.tenant_id, func.count(Branch.id)).group_by(Branch.tenant_id)
            )
        ).all()
    )

    return [
        TenantListItem(
            id=t.id,
            name=t.name,
            subdomain=t.subdomain,
            display_name=t.display_name,
            logo_url=t.logo_url,
            is_active=t.is_active,
            created_at=t.created_at,
            employee_count=emp_counts.get(t.id, 0),
            branch_count=branch_counts.get(t.id, 0),
        )
        for t in tenants
    ]


async def provision_tenant(session: AsyncSession, payload: TenantProvisionRequest) -> TenantListItem:
    subdomain = payload.subdomain.lower().strip()
    email = payload.admin_email.lower().strip()

    # 1. Uniqueness check for subdomain
    existing_tenant = await session.scalar(select(Tenant).where(Tenant.subdomain == subdomain))
    if existing_tenant is not None:
        raise ProblemError(400, "Subdomain in use", f"Subdomain '{subdomain}' is already taken.")

    # 2. Uniqueness check for admin email
    existing_user = await session.scalar(select(User).where(User.email == email))
    if existing_user is not None:
        raise ProblemError(400, "Email in use", f"User with email '{email}' already exists.")

    # 3. Create Tenant
    tenant_id = uuid4()
    now = datetime.now(UTC)
    tenant = Tenant(
        id=tenant_id,
        name=payload.name.lower().strip(),
        subdomain=subdomain,
        display_name=payload.display_name.strip(),
        logo_url=None,
        is_active=True,
        created_at=now,
    )
    session.add(tenant)
    await session.flush()

    # 4. Provision standard System Roles and Permissions
    catalog = list((await session.scalars(select(Permission))).all())
    by_code = {p.code: p for p in catalog}

    bundles = {
        "TENANT_ADMIN": list(by_code),
        "SUPERVISOR": [
            "org.branch.read",
            "org.branch.update",
            "org.department.read",
            "org.department.update",
            "employee.employee.read",
            "shift.template.read",
            "roster.pattern.read",
            "roster.instance.read",
            "roster.instance.update",
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

    roles: dict[str, Role] = {}
    for code, name in ROLE_NAMES.items():
        role = Role(
            id=uuid4(),
            tenant_id=tenant.id,
            code=code,
            name=name,
            is_system=True,
            created_at=now,
        )
        session.add(role)
        await session.flush()
        roles[code] = role

        for permission_code in bundles[code]:
            perm = by_code.get(permission_code)
            if perm:
                session.add(
                    RolePermission(
                        id=uuid4(),
                        tenant_id=tenant.id,
                        role_id=role.id,
                        permission_id=perm.id,
                    )
                )

    # 5. Create Primary Tenant Admin User
    admin_user = User(
        id=uuid4(),
        tenant_id=tenant.id,
        email=email,
        full_name=payload.admin_full_name.strip(),
        hashed_password=hash_password(payload.admin_password),
        is_active=True,
        created_at=now,
    )
    session.add(admin_user)
    await session.flush()

    # Assign TENANT_ADMIN role
    session.add(
        UserRole(
            id=uuid4(),
            tenant_id=tenant.id,
            user_id=admin_user.id,
            role_id=roles["TENANT_ADMIN"].id,
        )
    )

    # 6. Create Default Branch
    branch = Branch(
        id=uuid4(),
        tenant_id=tenant.id,
        name=payload.branch_name.strip(),
        code=payload.branch_code.upper().strip(),
        is_active=True,
        created_at=now,
    )
    session.add(branch)
    await session.flush()

    return TenantListItem(
        id=tenant.id,
        name=tenant.name,
        subdomain=tenant.subdomain,
        display_name=tenant.display_name,
        logo_url=tenant.logo_url,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
        employee_count=0,
        branch_count=1,
    )


async def update_tenant_status(session: AsyncSession, tenant_id: UUID, is_active: bool) -> TenantListItem:
    tenant = await session.get(Tenant, tenant_id)
    if tenant is None:
        raise ProblemError(404, "Tenant not found", f"Tenant {tenant_id} does not exist.")

    tenant.is_active = is_active
    await session.flush()

    emp_count = (
        await session.scalar(
            select(func.count(Employee.id)).where(Employee.tenant_id == tenant.id)
        )
    ) or 0

    branch_count = (
        await session.scalar(
            select(func.count(Branch.id)).where(Branch.tenant_id == tenant.id)
        )
    ) or 0

    return TenantListItem(
        id=tenant.id,
        name=tenant.name,
        subdomain=tenant.subdomain,
        display_name=tenant.display_name,
        logo_url=tenant.logo_url,
        is_active=tenant.is_active,
        created_at=tenant.created_at,
        employee_count=emp_count,
        branch_count=branch_count,
    )

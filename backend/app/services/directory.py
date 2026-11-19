from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.branch import Branch
from app.models.iam import Permission, Role, RolePermission, User, UserRole
from app.schemas.iam import BranchCreate, BranchOut, BranchUpdate, RoleCreate, RoleOut, RoleUpdate, UserOut
from app.services.access import require_codes, role_codes_for_user


def role_out(role: Role, codes: list[str]) -> RoleOut:
    return RoleOut(id=role.id, code=role.code, name=role.name, is_system=role.is_system, permissions=codes)


async def permission_codes_for_role(session: AsyncSession, tenant_id: UUID, role_id: UUID) -> list[str]:
    rows = await session.scalars(
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.tenant_id == tenant_id, RolePermission.role_id == role_id)
        .order_by(Permission.code)
    )
    return list(rows.all())


async def list_roles(session: AsyncSession, tenant_id: UUID) -> list[RoleOut]:
    roles = (await session.scalars(select(Role).where(Role.tenant_id == tenant_id).order_by(Role.code))).all()
    return [role_out(role, await permission_codes_for_role(session, tenant_id, role.id)) for role in roles]


async def create_role(session: AsyncSession, tenant_id: UUID, payload: RoleCreate) -> RoleOut:
    found = await require_codes(session, payload.permissions)
    role = Role(
        id=uuid4(),
        tenant_id=tenant_id,
        code=payload.code,
        name=payload.name,
        is_system=False,
        created_at=datetime.now(UTC),
    )
    session.add(role)
    for permission in found.values():
        session.add(RolePermission(id=uuid4(), tenant_id=tenant_id, role_id=role.id, permission_id=permission.id))
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProblemError(409, "Role already exists", "A role with this code already exists.") from exc
    return role_out(role, sorted(found))


async def update_role(session: AsyncSession, tenant_id: UUID, role_id: UUID, payload: RoleUpdate) -> RoleOut:
    role = await session.get(Role, role_id)
    if role is None or role.tenant_id != tenant_id:
        raise ProblemError(404, "Role not found", "No role with that id exists in this tenant.")
    if payload.name is not None:
        role.name = payload.name
    codes = await permission_codes_for_role(session, tenant_id, role_id)
    if payload.permissions is not None:
        found = await require_codes(session, payload.permissions)
        await session.execute(
            delete(RolePermission).where(RolePermission.tenant_id == tenant_id, RolePermission.role_id == role_id)
        )
        for permission in found.values():
            session.add(RolePermission(id=uuid4(), tenant_id=tenant_id, role_id=role.id, permission_id=permission.id))
        codes = sorted(found)
    await session.flush()
    return role_out(role, codes)


async def delete_role(session: AsyncSession, tenant_id: UUID, role_id: UUID) -> None:
    role = await session.get(Role, role_id)
    if role is None or role.tenant_id != tenant_id:
        raise ProblemError(404, "Role not found", "No role with that id exists in this tenant.")
    if role.is_system:
        raise ProblemError(409, "System role", "System roles cannot be deleted.")
    assigned = await session.scalar(
        select(UserRole.id).where(UserRole.tenant_id == tenant_id, UserRole.role_id == role_id).limit(1)
    )
    if assigned is not None:
        raise ProblemError(409, "Role in use", "Remove this role from every user before deleting it.")
    await session.execute(delete(RolePermission).where(RolePermission.tenant_id == tenant_id, RolePermission.role_id == role_id))
    await session.delete(role)


async def list_users(session: AsyncSession, tenant_id: UUID) -> list[UserOut]:
    users = (await session.scalars(select(User).where(User.tenant_id == tenant_id).order_by(User.email))).all()
    return [
        UserOut(
            id=user.id,
            email=user.email,
            full_name=user.full_name,
            is_active=user.is_active,
            roles=await role_codes_for_user(session, tenant_id, user.id),
        )
        for user in users
    ]


async def assign_role(session: AsyncSession, tenant_id: UUID, user_id: UUID, role_id: UUID) -> UserOut:
    user = await session.get(User, user_id)
    role = await session.get(Role, role_id)
    if user is None or user.tenant_id != tenant_id:
        raise ProblemError(404, "User not found", "No user with that id exists in this tenant.")
    if role is None or role.tenant_id != tenant_id:
        raise ProblemError(404, "Role not found", "No role with that id exists in this tenant.")
    session.add(UserRole(id=uuid4(), tenant_id=tenant_id, user_id=user_id, role_id=role_id))
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProblemError(409, "Already assigned", "This user already has that role.") from exc
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=await role_codes_for_user(session, tenant_id, user.id),
    )


async def unassign_role(session: AsyncSession, tenant_id: UUID, user_id: UUID, role_id: UUID) -> None:
    link = await session.scalar(
        select(UserRole).where(
            UserRole.tenant_id == tenant_id,
            UserRole.user_id == user_id,
            UserRole.role_id == role_id,
        )
    )
    if link is None:
        raise ProblemError(404, "Assignment not found", "That user does not have this role.")
    await session.delete(link)


def branch_out(branch: Branch) -> BranchOut:
    return BranchOut(id=branch.id, name=branch.name, code=branch.code, is_active=branch.is_active)


async def list_branches(session: AsyncSession, tenant_id: UUID) -> list[BranchOut]:
    rows = (await session.scalars(select(Branch).where(Branch.tenant_id == tenant_id).order_by(Branch.code))).all()
    return [branch_out(row) for row in rows]


async def create_branch(session: AsyncSession, tenant_id: UUID, payload: BranchCreate) -> BranchOut:
    branch = Branch(
        id=uuid4(),
        tenant_id=tenant_id,
        name=payload.name,
        code=payload.code,
        is_active=True,
        created_at=datetime.now(UTC),
    )
    session.add(branch)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProblemError(409, "Branch already exists", "A branch with this code already exists.") from exc
    return branch_out(branch)


async def update_branch(session: AsyncSession, tenant_id: UUID, branch_id: UUID, payload: BranchUpdate) -> BranchOut:
    branch = await session.get(Branch, branch_id)
    if branch is None or branch.tenant_id != tenant_id:
        raise ProblemError(404, "Branch not found", "No branch with that id exists in this tenant.")
    if payload.name is not None:
        branch.name = payload.name
    if payload.code is not None:
        branch.code = payload.code
    if payload.is_active is not None:
        branch.is_active = payload.is_active
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProblemError(409, "Branch already exists", "A branch with this code already exists.") from exc
    return branch_out(branch)


async def delete_branch(session: AsyncSession, tenant_id: UUID, branch_id: UUID) -> None:
    branch = await session.get(Branch, branch_id)
    if branch is None or branch.tenant_id != tenant_id:
        raise ProblemError(404, "Branch not found", "No branch with that id exists in this tenant.")
    await session.delete(branch)

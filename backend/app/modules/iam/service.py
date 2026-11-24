from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.core.security import hash_password
from app.models.iam import Role, User
from app.modules.iam import repository as iam_repo
from app.modules.iam.schemas import PermissionOut, RoleCreate, RoleOut, RoleUpdate, UserCreate, UserOut


def has_permission(granted: set[str], required: str) -> bool:
    return required in granted


async def create_user(session: AsyncSession, tenant_id: UUID, payload: UserCreate) -> UserOut:
    raw_password = payload.password or "ChangeMe-123"
    hashed = hash_password(raw_password)
    now = datetime.now(UTC)
    user = User(
        id=uuid4(),
        tenant_id=tenant_id,
        email=payload.email.strip().lower(),
        full_name=payload.full_name.strip(),
        hashed_password=hashed,
        is_active=True,
        created_at=now,
    )
    session.add(user)
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProblemError(409, "Email already exists", "A user with this email address already exists.") from exc

    if payload.role_id:
        role = await iam_repo.get_role_by_id(session, payload.role_id)
        if role and role.tenant_id == tenant_id:
            await iam_repo.add_user_role(session, tenant_id, user.id, role.id)

    roles = await iam_repo.get_role_codes_for_user(session, tenant_id, user.id)
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=roles,
    )


async def list_users(session: AsyncSession, tenant_id: UUID) -> list[UserOut]:
    users = await iam_repo.list_users(session, tenant_id)
    out: list[UserOut] = []
    for user in users:
        roles = await iam_repo.get_role_codes_for_user(session, tenant_id, user.id)
        out.append(
            UserOut(
                id=user.id,
                email=user.email,
                full_name=user.full_name,
                is_active=user.is_active,
                roles=roles,
            )
        )
    return out


async def assign_role(session: AsyncSession, tenant_id: UUID, user_id: UUID, role_id: UUID) -> UserOut:
    user = await iam_repo.get_user_by_id(session, user_id)
    role = await iam_repo.get_role_by_id(session, role_id)
    if user is None or user.tenant_id != tenant_id:
        raise ProblemError(404, "User not found", "No user with that id exists in this tenant.")
    if role is None or role.tenant_id != tenant_id:
        raise ProblemError(404, "Role not found", "No role with that id exists in this tenant.")

    try:
        await iam_repo.add_user_role(session, tenant_id, user_id, role_id)
    except IntegrityError as exc:
        raise ProblemError(409, "Already assigned", "This user already has that role.") from exc

    roles = await iam_repo.get_role_codes_for_user(session, tenant_id, user.id)
    return UserOut(
        id=user.id,
        email=user.email,
        full_name=user.full_name,
        is_active=user.is_active,
        roles=roles,
    )


async def unassign_role(session: AsyncSession, tenant_id: UUID, user_id: UUID, role_id: UUID) -> None:
    link = await iam_repo.find_user_role(session, tenant_id, user_id, role_id)
    if link is None:
        raise ProblemError(404, "Assignment not found", "That user does not have this role.")
    await iam_repo.remove_user_role(session, link)


async def list_roles(session: AsyncSession, tenant_id: UUID) -> list[RoleOut]:
    roles = await iam_repo.list_roles(session, tenant_id)
    out: list[RoleOut] = []
    for role in roles:
        codes = await iam_repo.get_permission_codes_for_role(session, tenant_id, role.id)
        out.append(
            RoleOut(
                id=role.id,
                code=role.code,
                name=role.name,
                is_system=role.is_system,
                permissions=codes,
            )
        )
    return out


async def create_role(session: AsyncSession, tenant_id: UUID, payload: RoleCreate) -> RoleOut:
    found = await iam_repo.get_permissions_by_codes(session, payload.permissions)
    missing = sorted(set(payload.permissions) - set(found))
    if missing:
        raise ProblemError(422, "Unknown permission", ", ".join(missing))

    try:
        role = await iam_repo.create_role_record(
            session,
            tenant_id=tenant_id,
            code=payload.code,
            name=payload.name,
            permissions=list(found.values()),
        )
    except IntegrityError as exc:
        raise ProblemError(409, "Role already exists", "A role with this code already exists.") from exc

    return RoleOut(
        id=role.id,
        code=role.code,
        name=role.name,
        is_system=role.is_system,
        permissions=sorted(found.keys()),
    )


async def update_role(session: AsyncSession, tenant_id: UUID, role_id: UUID, payload: RoleUpdate) -> RoleOut:
    role = await iam_repo.get_role_by_id(session, role_id)
    if role is None or role.tenant_id != tenant_id:
        raise ProblemError(404, "Role not found", "No role with that id exists in this tenant.")

    permissions_list = None
    codes = await iam_repo.get_permission_codes_for_role(session, tenant_id, role_id)
    if payload.permissions is not None:
        found = await iam_repo.get_permissions_by_codes(session, payload.permissions)
        missing = sorted(set(payload.permissions) - set(found))
        if missing:
            raise ProblemError(422, "Unknown permission", ", ".join(missing))
        permissions_list = list(found.values())
        codes = sorted(found.keys())

    updated = await iam_repo.update_role_record(session, tenant_id, role, payload.name, permissions_list)
    return RoleOut(
        id=updated.id,
        code=updated.code,
        name=updated.name,
        is_system=updated.is_system,
        permissions=codes,
    )


async def delete_role(session: AsyncSession, tenant_id: UUID, role_id: UUID) -> None:
    role = await iam_repo.get_role_by_id(session, role_id)
    if role is None or role.tenant_id != tenant_id:
        raise ProblemError(404, "Role not found", "No role with that id exists in this tenant.")
    if role.is_system:
        raise ProblemError(409, "System role", "System roles cannot be deleted.")

    if await iam_repo.is_role_assigned_to_any_user(session, tenant_id, role_id):
        raise ProblemError(409, "Role in use", "Remove this role from every user before deleting it.")

    await iam_repo.delete_role_record(session, tenant_id, role)


async def list_permissions(session: AsyncSession) -> list[PermissionOut]:
    perms = await iam_repo.list_all_permissions(session)
    return [
        PermissionOut(
            code=p.code,
            module=p.module,
            resource=p.resource,
            action=p.action,
            description=p.description,
        )
        for p in perms
    ]

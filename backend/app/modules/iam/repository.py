from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.iam import Permission, Role, RolePermission, User, UserRole


async def list_users(session: AsyncSession, tenant_id: UUID) -> list[User]:
    stmt = select(User).where(User.tenant_id == tenant_id).order_by(User.email)
    return list((await session.scalars(stmt)).all())


async def get_user_by_id(session: AsyncSession, user_id: UUID) -> User | None:
    return await session.get(User, user_id)


async def get_role_codes_for_user(session: AsyncSession, tenant_id: UUID, user_id: UUID) -> list[str]:
    stmt = (
        select(Role.code)
        .join(UserRole, (UserRole.role_id == Role.id) & (UserRole.tenant_id == Role.tenant_id))
        .where(UserRole.tenant_id == tenant_id, UserRole.user_id == user_id)
        .order_by(Role.code)
    )
    return list((await session.scalars(stmt)).all())


async def add_user_role(session: AsyncSession, tenant_id: UUID, user_id: UUID, role_id: UUID) -> UserRole:
    user_role = UserRole(id=uuid4(), tenant_id=tenant_id, user_id=user_id, role_id=role_id)
    session.add(user_role)
    await session.flush()
    return user_role


async def find_user_role(session: AsyncSession, tenant_id: UUID, user_id: UUID, role_id: UUID) -> UserRole | None:
    stmt = select(UserRole).where(
        UserRole.tenant_id == tenant_id,
        UserRole.user_id == user_id,
        UserRole.role_id == role_id,
    )
    return await session.scalar(stmt)


async def remove_user_role(session: AsyncSession, link: UserRole) -> None:
    await session.delete(link)


async def list_roles(session: AsyncSession, tenant_id: UUID) -> list[Role]:
    stmt = select(Role).where(Role.tenant_id == tenant_id).order_by(Role.code)
    return list((await session.scalars(stmt)).all())


async def get_role_by_id(session: AsyncSession, role_id: UUID) -> Role | None:
    return await session.get(Role, role_id)


async def get_permission_codes_for_role(session: AsyncSession, tenant_id: UUID, role_id: UUID) -> list[str]:
    stmt = (
        select(Permission.code)
        .join(RolePermission, RolePermission.permission_id == Permission.id)
        .where(RolePermission.tenant_id == tenant_id, RolePermission.role_id == role_id)
        .order_by(Permission.code)
    )
    return list((await session.scalars(stmt)).all())


async def get_permissions_by_codes(session: AsyncSession, codes: list[str]) -> dict[str, Permission]:
    if not codes:
        return {}
    stmt = select(Permission).where(Permission.code.in_(codes))
    return {row.code: row for row in (await session.scalars(stmt)).all()}


async def create_role_record(
    session: AsyncSession,
    tenant_id: UUID,
    code: str,
    name: str,
    permissions: list[Permission],
) -> Role:
    role = Role(
        id=uuid4(),
        tenant_id=tenant_id,
        code=code,
        name=name,
        is_system=False,
        created_at=datetime.now(UTC),
    )
    session.add(role)
    for perm in permissions:
        session.add(RolePermission(id=uuid4(), tenant_id=tenant_id, role_id=role.id, permission_id=perm.id))
    await session.flush()
    return role


async def update_role_record(
    session: AsyncSession,
    tenant_id: UUID,
    role: Role,
    name: str | None,
    permissions: list[Permission] | None,
) -> Role:
    if name is not None:
        role.name = name
    if permissions is not None:
        await session.execute(
            delete(RolePermission).where(RolePermission.tenant_id == tenant_id, RolePermission.role_id == role.id)
        )
        for perm in permissions:
            session.add(RolePermission(id=uuid4(), tenant_id=tenant_id, role_id=role.id, permission_id=perm.id))
    await session.flush()
    return role


async def is_role_assigned_to_any_user(session: AsyncSession, tenant_id: UUID, role_id: UUID) -> bool:
    stmt = select(UserRole.id).where(UserRole.tenant_id == tenant_id, UserRole.role_id == role_id).limit(1)
    return (await session.scalar(stmt)) is not None


async def delete_role_record(session: AsyncSession, tenant_id: UUID, role: Role) -> None:
    await session.execute(
        delete(RolePermission).where(RolePermission.tenant_id == tenant_id, RolePermission.role_id == role.id)
    )
    await session.delete(role)


async def list_all_permissions(session: AsyncSession) -> list[Permission]:
    stmt = select(Permission).order_by(Permission.module, Permission.resource, Permission.action)
    return list((await session.scalars(stmt)).all())

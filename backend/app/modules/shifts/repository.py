from collections.abc import Sequence
from typing import Any
from uuid import UUID

from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models.shift import ShiftSession, ShiftTemplate


async def create_shift_template(
    session: AsyncSession,
    tenant_id: UUID,
    template: ShiftTemplate,
    sessions: list[ShiftSession],
) -> ShiftTemplate:
    template.sessions = sessions
    session.add(template)
    await session.flush()
    return template


async def get_shift_template_by_id(
    session: AsyncSession,
    tenant_id: UUID,
    template_id: UUID,
) -> ShiftTemplate | None:
    stmt = (
        select(ShiftTemplate)
        .options(selectinload(ShiftTemplate.sessions), selectinload(ShiftTemplate.policy))
        .where(ShiftTemplate.tenant_id == tenant_id, ShiftTemplate.id == template_id)
    )
    return await session.scalar(stmt)


async def get_shift_template_by_code(
    session: AsyncSession,
    tenant_id: UUID,
    code: str,
) -> ShiftTemplate | None:
    stmt = (
        select(ShiftTemplate)
        .options(selectinload(ShiftTemplate.sessions), selectinload(ShiftTemplate.policy))
        .where(ShiftTemplate.tenant_id == tenant_id, ShiftTemplate.code == code)
    )
    return await session.scalar(stmt)


async def list_shift_templates(
    session: AsyncSession,
    tenant_id: UUID,
    active_only: bool = False,
) -> Sequence[ShiftTemplate]:
    stmt = (
        select(ShiftTemplate)
        .options(selectinload(ShiftTemplate.sessions), selectinload(ShiftTemplate.policy))
        .where(ShiftTemplate.tenant_id == tenant_id)
        .order_by(ShiftTemplate.code)
    )
    if active_only:
        stmt = stmt.where(ShiftTemplate.is_active.is_(True))
    result = await session.scalars(stmt)
    return result.all()


async def update_shift_template(
    session: AsyncSession,
    tenant_id: UUID,
    template: ShiftTemplate,
    updates: dict[str, Any],
    new_sessions: list[ShiftSession] | None = None,
) -> ShiftTemplate:
    for key, val in updates.items():
        setattr(template, key, val)

    if new_sessions is not None:
        template.sessions = new_sessions

    await session.flush()
    return template


async def delete_shift_template(
    session: AsyncSession,
    tenant_id: UUID,
    template: ShiftTemplate,
) -> None:
    await session.delete(template)
    await session.flush()

from collections.abc import AsyncIterator
from uuid import UUID

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import settings

engine = create_async_engine(settings.database_url, pool_pre_ping=True)
SessionLocal = async_sessionmaker(engine, expire_on_commit=False)

migrate_engine = create_async_engine(settings.database_url_migrate, pool_pre_ping=True)
MigrateSession = async_sessionmaker(migrate_engine, expire_on_commit=False)


async def set_tenant(session: AsyncSession, tenant_id: UUID) -> None:
    await session.execute(
        text("SELECT set_config('app.current_tenant_id', :tenant_id, true)"),
        {"tenant_id": str(tenant_id)},
    )


async def tenant_session(tenant_id: UUID) -> AsyncIterator[AsyncSession]:
    async with SessionLocal() as session:
        await set_tenant(session, tenant_id)
        yield session

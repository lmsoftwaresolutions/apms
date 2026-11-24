"""Tenant loop for the shift-cutoff rollup.

A Celery beat entry calls `run_cutoff_all_tenants`. The function is idempotent:
a day that already matches its punches is not evaluated again, and a second
trace is not written. Redis and the worker process are deployment concerns.
"""

from datetime import UTC, datetime

from sqlalchemy import select

from app.core.database import MigrateSession, SessionLocal, set_tenant
from app.models.iam import Tenant
from app.modules.attendance.cutoff import run_cutoff_rollup


async def run_cutoff_all_tenants(now: datetime | None = None) -> dict[str, int]:
    moment = now or datetime.now(UTC)
    async with MigrateSession() as migrate:
        tenant_ids = list((await migrate.scalars(select(Tenant.id))).all())
    evaluated = 0
    failed = 0
    async with SessionLocal() as session:
        for tenant_id in tenant_ids:
            try:
                await set_tenant(session, tenant_id)
                evaluated += await run_cutoff_rollup(session, tenant_id, moment)
                await session.commit()
            except Exception:
                failed += 1
                await session.rollback()
    return {"tenants": len(tenant_ids), "evaluated": evaluated, "failed": failed}

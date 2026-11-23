from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.privacy import ConsentEvent, PiiAccessAudit

CONSENT_PURPOSE = "Workplace attendance capture"
CONSENT_RETENTION = "Punch events follow the labour retention period. Biometric templates stay off the cloud."


async def insert_consent_event(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    action: str,
    actor_user_id: UUID | None,
) -> None:
    session.add(
        ConsentEvent(
            id=uuid4(),
            tenant_id=tenant_id,
            employee_id=employee_id,
            action=action,
            purpose=CONSENT_PURPOSE,
            retention=CONSENT_RETENTION,
            actor_user_id=actor_user_id,
            recorded_at=datetime.now(UTC),
        )
    )
    await session.flush()


async def insert_pii_audit(
    session: AsyncSession,
    tenant_id: UUID,
    employee_id: UUID,
    actor_user_id: UUID,
    field_name: str,
) -> None:
    session.add(
        PiiAccessAudit(
            id=uuid4(),
            tenant_id=tenant_id,
            employee_id=employee_id,
            actor_user_id=actor_user_id,
            field_name=field_name,
            accessed_at=datetime.now(UTC),
        )
    )
    await session.flush()

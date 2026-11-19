import hashlib
import json
from datetime import UTC, datetime
from uuid import UUID, uuid4

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.errors import ProblemError
from app.models.iam import IdempotencyKey


def request_hash(payload: object) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str).encode()
    return hashlib.sha256(raw).hexdigest()


async def replay_or_reserve(
    session: AsyncSession,
    tenant_id: UUID,
    key: str | None,
    path: str,
    payload: object,
) -> dict[str, object] | None:
    if not key:
        return None
    digest = request_hash(payload)
    existing = await session.scalar(
        select(IdempotencyKey).where(IdempotencyKey.tenant_id == tenant_id, IdempotencyKey.key == key)
    )
    if existing is None:
        return None
    if existing.request_hash != digest or existing.path != path:
        raise ProblemError(409, "Idempotency conflict", "This key was already used for a different request.")
    return {"status_code": existing.status_code, "body": existing.response_body, "replay": True}


async def store_response(
    session: AsyncSession,
    tenant_id: UUID,
    key: str | None,
    path: str,
    payload: object,
    status_code: int,
    body: dict[str, object],
) -> None:
    if not key:
        return
    session.add(
        IdempotencyKey(
            id=uuid4(),
            tenant_id=tenant_id,
            key=key,
            path=path,
            request_hash=request_hash(payload),
            status_code=status_code,
            response_body=body,
            created_at=datetime.now(UTC),
        )
    )
    try:
        await session.flush()
    except IntegrityError as exc:
        raise ProblemError(409, "Idempotency conflict", "This key was already used.") from exc

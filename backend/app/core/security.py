from datetime import UTC, datetime, timedelta
from uuid import UUID

import bcrypt
import jwt

from app.core.config import settings

_DUMMY_HASH = bcrypt.hashpw(b"not-a-user", bcrypt.gensalt())


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode(), bcrypt.gensalt()).decode()


def verify_password(password: str, password_hash: str | None) -> bool:
    candidate = password_hash.encode() if password_hash else _DUMMY_HASH
    try:
        return bcrypt.checkpw(password.encode(), candidate)
    except ValueError:
        return False


def create_access_token(user_id: UUID, tenant_id: UUID) -> str:
    expires = datetime.now(UTC) + timedelta(minutes=settings.jwt_ttl_minutes)
    payload = {"sub": str(user_id), "tid": str(tenant_id), "exp": expires}
    return jwt.encode(payload, settings.jwt_secret, algorithm="HS256")


def decode_access_token(token: str) -> tuple[UUID, UUID]:
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
        return UUID(payload["sub"]), UUID(payload["tid"])
    except (jwt.PyJWTError, KeyError, ValueError) as exc:
        raise ValueError("invalid token") from exc

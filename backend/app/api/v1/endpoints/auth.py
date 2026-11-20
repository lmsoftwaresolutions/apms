# Backwards-compatibility wrapper — real logic lives in app.modules.auth
from app.api.deps import IdempotencyDep, idempotency_header
from app.modules.auth.router import router

__all__ = ["router", "IdempotencyDep", "idempotency_header"]

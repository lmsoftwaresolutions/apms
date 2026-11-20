# Backwards-compatibility wrapper
from app.api.deps import IdempotencyDep, idempotency_header
from app.modules.auth.router import router

CurrentUserDep = None

__all__ = ["router", "IdempotencyDep", "idempotency_header", "CurrentUserDep"]

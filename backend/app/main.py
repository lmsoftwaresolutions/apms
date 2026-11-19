from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.router import api_router
from app.core.config import settings
from app.core.errors import register_problem_handlers

app = FastAPI(title="APMS", version="0.1.0", summary="Tenant IAM and branch API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
register_problem_handlers(app)
app.include_router(api_router, prefix="/api/v1")


@app.get("/health", summary="Process health")
async def health() -> dict[str, str]:
    return {"status": "ok"}

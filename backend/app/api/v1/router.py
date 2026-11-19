from fastapi import APIRouter

from app.api.v1.endpoints import auth, branches, iam

api_router = APIRouter()
api_router.include_router(auth.router)
api_router.include_router(iam.router)
api_router.include_router(branches.router)

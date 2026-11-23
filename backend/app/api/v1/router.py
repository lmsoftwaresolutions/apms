from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.branches.router import router as branches_router
from app.modules.departments.router import router as departments_router
from app.modules.iam.router import router as iam_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(iam_router)
api_router.include_router(branches_router)
api_router.include_router(departments_router)

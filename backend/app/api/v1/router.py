from fastapi import APIRouter

from app.modules.auth.router import router as auth_router
from app.modules.branches.router import router as branches_router
from app.modules.employees.router import router as employees_router
from app.modules.iam.router import router as iam_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(iam_router)
api_router.include_router(branches_router)
api_router.include_router(employees_router)

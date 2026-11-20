from fastapi import APIRouter

from app.modules.attendance.router import router as attendance_router
from app.modules.auth.router import router as auth_router
from app.modules.branches.router import router as branches_router
from app.modules.departments.router import router as departments_router
from app.modules.employees.router import router as employees_router
from app.modules.iam.router import router as iam_router
from app.modules.punches.router import router as punches_router

api_router = APIRouter()
api_router.include_router(auth_router)
api_router.include_router(iam_router)
api_router.include_router(branches_router)
api_router.include_router(departments_router)
api_router.include_router(employees_router)
api_router.include_router(punches_router)
api_router.include_router(attendance_router)

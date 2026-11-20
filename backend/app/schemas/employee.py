# Backwards compatibility bridge delegating to modular architecture
from app.modules.employees.schemas import (
    DeletedOut,
    EmployeeCreate,
    EmployeeOut,
    EmployeeUpdate,
)

__all__ = [
    "EmployeeCreate",
    "EmployeeUpdate",
    "EmployeeOut",
    "DeletedOut",
]

# Backwards compatibility bridge delegating to modular architecture
from app.modules.employees.service import (
    create_employee,
    delete_employee,
    employee_to_out,
    get_employee,
    list_employees,
    update_employee,
)

__all__ = [
    "create_employee",
    "get_employee",
    "list_employees",
    "update_employee",
    "delete_employee",
    "employee_to_out",
]

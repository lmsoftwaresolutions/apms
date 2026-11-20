# Backwards compatibility bridge delegating to modular architecture
from app.modules.branches.service import (
    branch_to_out as branch_out,
    create_branch,
    delete_branch,
    list_branches,
    update_branch,
)
from app.modules.departments.service import (
    create_department,
    delete_department,
    department_to_out as department_out,
    list_departments,
    update_department,
)
from app.modules.iam.service import (
    assign_role,
    create_role,
    delete_role,
    list_roles,
    list_users,
    unassign_role,
    update_role,
)

__all__ = [
    "list_roles",
    "create_role",
    "update_role",
    "delete_role",
    "list_users",
    "assign_role",
    "unassign_role",
    "branch_out",
    "list_branches",
    "create_branch",
    "update_branch",
    "delete_branch",
    "department_out",
    "list_departments",
    "create_department",
    "update_department",
    "delete_department",
]

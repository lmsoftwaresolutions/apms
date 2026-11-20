# Backwards compatibility re-exports from modular architecture
from app.modules.auth.schemas import (
    LoginIn,
    MeOut,
    TenantOut,
    TenantUpdate,
    TokenOut,
)
from app.modules.branches.schemas import (
    BranchCreate,
    BranchOut,
    BranchUpdate,
)
from app.modules.departments.schemas import (
    DepartmentCreate,
    DepartmentOut,
    DepartmentUpdate,
)
from app.modules.iam.schemas import (
    AssignmentIn,
    DeletedOut,
    PermissionOut,
    RoleCreate,
    RoleOut,
    RoleUpdate,
    UserOut,
)

__all__ = [
    "TokenOut",
    "LoginIn",
    "TenantOut",
    "TenantUpdate",
    "MeOut",
    "PermissionOut",
    "RoleOut",
    "RoleCreate",
    "RoleUpdate",
    "UserOut",
    "AssignmentIn",
    "BranchOut",
    "BranchCreate",
    "BranchUpdate",
    "DepartmentOut",
    "DepartmentCreate",
    "DepartmentUpdate",
    "DeletedOut",
]

"""Grant department and employee permissions to existing tenant admins.

004 and 005 insert the catalog rows only. A database seeded before those
revisions, then upgraded, would leave TENANT_ADMIN without the new keys.
This revision attaches the already-shipped codes. It does not rewrite 004 or 005.

Revision ID: 009_grant_org_employee_admin
Revises: 008_attendance_roster_fk
Create Date: 2026-11-23
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "009_grant_org_employee_admin"
down_revision = "008_attendance_roster_fk"
branch_labels = None
depends_on = None

PERMISSION_CODES = (
    "org.department.create",
    "org.department.read",
    "org.department.update",
    "org.department.delete",
    "employee.employee.create",
    "employee.employee.read",
    "employee.employee.update",
    "employee.employee.delete",
)

GRANT_TENANT_ADMIN = text(
    """
    INSERT INTO role_permissions (tenant_id, role_id, permission_id)
    SELECT r.tenant_id, r.id, p.id
    FROM roles r
    JOIN permissions p ON p.code IN :codes
    WHERE r.code = 'TENANT_ADMIN'
    ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING
    """
).bindparams(bindparam("codes", expanding=True))

REVOKE_TENANT_ADMIN = text(
    """
    DELETE FROM role_permissions AS rp
    USING roles AS r, permissions AS p
    WHERE rp.tenant_id = r.tenant_id
      AND rp.role_id = r.id
      AND r.code = 'TENANT_ADMIN'
      AND rp.permission_id = p.id
      AND p.code IN :codes
    """
).bindparams(bindparam("codes", expanding=True))


def upgrade() -> None:
    op.get_bind().execute(GRANT_TENANT_ADMIN, {"codes": list(PERMISSION_CODES)})


def downgrade() -> None:
    op.get_bind().execute(REVOKE_TENANT_ADMIN, {"codes": list(PERMISSION_CODES)})

"""Designations schema, RLS policies, permissions and employee designation_id FK.

Revision ID: 010_designations_and_employee_fk
Revises: 009_grant_org_employee_admin
Create Date: 2026-11-23
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "010_designations_and_employee_fk"
down_revision = "009_grant_org_employee_admin"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("org.designation.create", "org", "designation", "create", "Create department designations"),
    ("org.designation.read", "org", "designation", "read", "Read department designations"),
    ("org.designation.update", "org", "designation", "update", "Update department designations"),
    ("org.designation.delete", "org", "designation", "delete", "Delete department designations"),
)

STATEMENTS = [
    """
    CREATE TABLE designations (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      department_id uuid NOT NULL,
      code varchar(30) NOT NULL,
      name varchar(200) NOT NULL,
      description text,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_designations_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_designations_tenant_dept_code UNIQUE (tenant_id, department_id, code),
      CONSTRAINT uq_designations_tenant_dept_name UNIQUE (tenant_id, department_id, name),
      CONSTRAINT fk_designations_department FOREIGN KEY (tenant_id, department_id)
        REFERENCES departments (tenant_id, id) ON DELETE CASCADE
    )
    """,
    "ALTER TABLE designations ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE designations FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_designations ON designations
    FOR ALL
    USING (
      tenant_id = CASE
        WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
        THEN current_setting('app.current_tenant_id', true)::uuid
        ELSE NULL
      END
    )
    WITH CHECK (
      tenant_id = CASE
        WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
        THEN current_setting('app.current_tenant_id', true)::uuid
        ELSE NULL
      END
    )
    """,
    "GRANT SELECT, INSERT, UPDATE, DELETE ON designations TO apms_app",
    "ALTER TABLE employees ADD COLUMN designation_id uuid",
    """
    ALTER TABLE employees ADD CONSTRAINT fk_employees_designation
      FOREIGN KEY (tenant_id, designation_id)
      REFERENCES designations (tenant_id, id)
      ON DELETE SET NULL
    """,
    "CREATE INDEX ix_employees_tenant_designation ON employees (tenant_id, designation_id)",
]

INSERT_PERMISSION = text(
    """
    INSERT INTO permissions (code, module, resource, action, description)
    VALUES (:code, :module, :resource, :action, :description)
    ON CONFLICT (code) DO NOTHING
    """
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
DELETE_ROLE_GRANTS = text(
    """
    DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code IN :codes)
    """
).bindparams(bindparam("codes", expanding=True))
DELETE_PERMISSIONS = text(
    "DELETE FROM permissions WHERE code IN :codes"
).bindparams(bindparam("codes", expanding=True))


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)

    bind = op.get_bind()
    for code, module, resource, action, description in PERMISSIONS:
        bind.execute(
            INSERT_PERMISSION,
            {
                "code": code,
                "module": module,
                "resource": resource,
                "action": action,
                "description": description,
            },
        )
    codes = [item[0] for item in PERMISSIONS]
    bind.execute(GRANT_TENANT_ADMIN, {"codes": codes})


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_employees_tenant_designation")
    op.execute("ALTER TABLE employees DROP CONSTRAINT IF EXISTS fk_employees_designation")
    op.execute("ALTER TABLE employees DROP COLUMN IF EXISTS designation_id")

    codes = [item[0] for item in PERMISSIONS]
    bind = op.get_bind()
    bind.execute(DELETE_ROLE_GRANTS, {"codes": codes})
    bind.execute(DELETE_PERMISSIONS, {"codes": codes})
    op.execute("DROP TABLE IF EXISTS designations CASCADE")

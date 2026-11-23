"""Department schema and permissions.

Revision ID: 004_departments
Revises: 003_rls_fail_closed
Create Date: 2026-11-23
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "004_departments"
down_revision = "003_rls_fail_closed"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("org.department.create", "org", "department", "create", "Create departments"),
    ("org.department.read", "org", "department", "read", "Read departments"),
    ("org.department.update", "org", "department", "update", "Update departments"),
    ("org.department.delete", "org", "department", "delete", "Delete departments"),
)

STATEMENTS = [
    """
    CREATE TABLE departments (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      branch_id uuid NOT NULL,
      name varchar(200) NOT NULL,
      code varchar(20) NOT NULL,
      parent_dept_id uuid,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_departments_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_departments_tenant_branch_code UNIQUE (tenant_id, branch_id, code),
      CONSTRAINT fk_departments_branch FOREIGN KEY (tenant_id, branch_id)
        REFERENCES branches (tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT fk_departments_parent FOREIGN KEY (tenant_id, parent_dept_id)
        REFERENCES departments (tenant_id, id)
    )
    """,
    "ALTER TABLE departments ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE departments FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_departments ON departments
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO apms_app",
]

INSERT_PERMISSION = text(
    """
    INSERT INTO permissions (code, module, resource, action, description)
    VALUES (:code, :module, :resource, :action, :description)
    ON CONFLICT (code) DO NOTHING
    """
)
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


def downgrade() -> None:
    codes = [item[0] for item in PERMISSIONS]
    bind = op.get_bind()
    bind.execute(DELETE_ROLE_GRANTS, {"codes": codes})
    bind.execute(DELETE_PERMISSIONS, {"codes": codes})
    op.execute("DROP TABLE IF EXISTS departments CASCADE")

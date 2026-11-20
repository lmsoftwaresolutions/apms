"""Add departments table and permissions."""

from alembic import op

revision = "002_departments"
down_revision = "003_rls_fail_closed"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("org.department.create", "org", "department", "create", "Create departments"),
    ("org.department.read", "org", "department", "read", "Read departments"),
    ("org.department.update", "org", "department", "update", "Update departments"),
    ("org.department.delete", "org", "department", "delete", "Delete departments"),
)


def upgrade() -> None:
    op.execute(
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
          CONSTRAINT fk_departments_branch FOREIGN KEY (tenant_id, branch_id)
            REFERENCES branches (tenant_id, id) ON DELETE CASCADE,
          CONSTRAINT fk_departments_parent FOREIGN KEY (tenant_id, parent_dept_id)
            REFERENCES departments (tenant_id, id),
          CONSTRAINT uq_departments_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT uq_departments_tenant_branch_code UNIQUE (tenant_id, branch_id, code)
        )
        """
    )
    op.execute("ALTER TABLE departments ENABLE ROW LEVEL SECURITY")
    op.execute("ALTER TABLE departments FORCE ROW LEVEL SECURITY")
    op.execute(
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
        """
    )
    values = ",\n".join(
        f"('{code}', '{module}', '{resource}', '{action}', '{description}')"
        for code, module, resource, action, description in PERMISSIONS
    )
    op.execute(
        f"""
        INSERT INTO permissions (code, module, resource, action, description)
        VALUES {values}
        ON CONFLICT (code) DO NOTHING
        """
    )
    op.execute("GRANT SELECT, INSERT, UPDATE, DELETE ON departments TO apms_app")


def downgrade() -> None:
    codes = ", ".join(f"'{p[0]}'" for p in PERMISSIONS)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ({codes}))
        """
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({codes})")
    op.execute("DROP TABLE IF EXISTS departments CASCADE")


"""IAM and branch schema."""

from alembic import op

revision = "001_iam_branches"
down_revision = None
branch_labels = None
depends_on = None

TENANT_TABLES = (
    "users",
    "roles",
    "role_permissions",
    "user_roles",
    "branches",
    "idempotency_keys",
)

PERMISSIONS = (
    ("iam.role.create", "iam", "role", "create", "Create roles"),
    ("iam.role.read", "iam", "role", "read", "Read roles"),
    ("iam.role.update", "iam", "role", "update", "Update roles"),
    ("iam.role.delete", "iam", "role", "delete", "Delete roles"),
    ("iam.assignment.create", "iam", "assignment", "create", "Assign roles"),
    ("iam.assignment.read", "iam", "assignment", "read", "Read role assignments"),
    ("iam.assignment.delete", "iam", "assignment", "delete", "Remove role assignments"),
    ("org.branch.create", "org", "branch", "create", "Create branches"),
    ("org.branch.read", "org", "branch", "read", "Read branches"),
    ("org.branch.update", "org", "branch", "update", "Update branches"),
    ("org.branch.delete", "org", "branch", "delete", "Delete branches"),
    ("org.tenant.read", "org", "tenant", "read", "Read tenant profile"),
    ("org.tenant.update", "org", "tenant", "update", "Update tenant name and logo"),
)

STATEMENTS = [
    """
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'apms_app') THEN
        CREATE ROLE apms_app LOGIN PASSWORD 'apms_app' NOSUPERUSER NOBYPASSRLS;
      END IF;
    END
    $$
    """,
    """
    CREATE TABLE tenants (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      name varchar(200) NOT NULL,
      subdomain varchar(100) NOT NULL UNIQUE,
      display_name varchar(200) NOT NULL,
      logo_url varchar(500),
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp()
    )
    """,
    """
    CREATE TABLE permissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      code varchar(80) NOT NULL UNIQUE,
      module varchar(40) NOT NULL,
      resource varchar(40) NOT NULL,
      action varchar(20) NOT NULL CHECK (action IN ('create', 'read', 'update', 'delete')),
      description varchar(200) NOT NULL
    )
    """,
    """
    CREATE TABLE users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      email varchar(255) NOT NULL UNIQUE,
      full_name varchar(200) NOT NULL,
      hashed_password varchar(255) NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_users_tenant_id UNIQUE (tenant_id, id)
    )
    """,
    """
    CREATE TABLE roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      code varchar(40) NOT NULL,
      name varchar(120) NOT NULL,
      is_system boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_roles_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_roles_tenant_code UNIQUE (tenant_id, code)
    )
    """,
    """
    CREATE TABLE role_permissions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      role_id uuid NOT NULL,
      permission_id uuid NOT NULL REFERENCES permissions(id),
      CONSTRAINT uq_role_permission UNIQUE (tenant_id, role_id, permission_id),
      CONSTRAINT fk_role_permissions_role FOREIGN KEY (tenant_id, role_id)
        REFERENCES roles (tenant_id, id)
    )
    """,
    """
    CREATE TABLE user_roles (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      user_id uuid NOT NULL,
      role_id uuid NOT NULL,
      CONSTRAINT uq_user_role UNIQUE (tenant_id, user_id, role_id),
      CONSTRAINT fk_user_roles_user FOREIGN KEY (tenant_id, user_id)
        REFERENCES users (tenant_id, id),
      CONSTRAINT fk_user_roles_role FOREIGN KEY (tenant_id, role_id)
        REFERENCES roles (tenant_id, id)
    )
    """,
    """
    CREATE TABLE branches (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      name varchar(200) NOT NULL,
      code varchar(20) NOT NULL,
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_branches_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_branches_tenant_code UNIQUE (tenant_id, code)
    )
    """,
    """
    CREATE TABLE idempotency_keys (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL,
      key varchar(200) NOT NULL,
      path text NOT NULL,
      request_hash varchar(64) NOT NULL,
      status_code integer NOT NULL,
      response_body jsonb NOT NULL,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_idempotency_tenant_key UNIQUE (tenant_id, key)
    )
    """,
    """
    CREATE OR REPLACE FUNCTION iam_lookup_user(p_email text)
    RETURNS TABLE (id uuid, tenant_id uuid, hashed_password text, is_active boolean)
    LANGUAGE sql
    SECURITY DEFINER
    SET search_path = public
    AS $$
      SELECT users.id, users.tenant_id, users.hashed_password, users.is_active
      FROM users
      WHERE users.email = lower(p_email)
    $$
    """,
    "REVOKE ALL ON FUNCTION iam_lookup_user(text) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION iam_lookup_user(text) TO apms_app",
    "ALTER TABLE tenants ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE tenants FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_tenants ON tenants
    FOR ALL
    USING (
      current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
      AND id = current_setting('app.current_tenant_id', true)::uuid
    )
    WITH CHECK (
      current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
      AND id = current_setting('app.current_tenant_id', true)::uuid
    )
    """,
]


def _policy(table: str) -> str:
    return f"""
    CREATE POLICY tenant_isolation_{table} ON {table}
    FOR ALL
    USING (
      current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{{36}}$'
      AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
    WITH CHECK (
      current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{{36}}$'
      AND tenant_id = current_setting('app.current_tenant_id', true)::uuid
    )
    """


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)
    for table in TENANT_TABLES:
        op.execute(f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY")
        op.execute(f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY")
        op.execute(_policy(table))
    values = ",\n".join(
        "('{code}', '{module}', '{resource}', '{action}', '{description}')".format(
            code=code,
            module=module,
            resource=resource,
            action=action,
            description=description.replace("'", "''"),
        )
        for code, module, resource, action, description in PERMISSIONS
    )
    op.execute(
        f"""
        INSERT INTO permissions (code, module, resource, action, description)
        VALUES {values}
        """
    )
    op.execute("GRANT USAGE ON SCHEMA public TO apms_app")
    op.execute(
        """
        GRANT SELECT, INSERT, UPDATE, DELETE ON
          tenants, users, roles, role_permissions, user_roles, branches, idempotency_keys
        TO apms_app
        """
    )
    op.execute("GRANT SELECT ON permissions TO apms_app")


def downgrade() -> None:
    op.execute("DROP FUNCTION IF EXISTS iam_lookup_user(text)")
    for table in (
        "idempotency_keys",
        "branches",
        "user_roles",
        "role_permissions",
        "roles",
        "users",
        "permissions",
        "tenants",
    ):
        op.execute(f"DROP TABLE IF EXISTS {table} CASCADE")

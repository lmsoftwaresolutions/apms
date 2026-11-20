"""Apply fail-closed CASE RLS policies to existing tables."""

from alembic import op

revision = "003_rls_fail_closed"
down_revision = "001_iam_branches"
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


def upgrade() -> None:
    # 1. Update tenants table policy
    op.execute("DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants")
    op.execute(
        """
        CREATE POLICY tenant_isolation_tenants ON tenants
        FOR ALL
        USING (
          id = CASE
            WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
            THEN current_setting('app.current_tenant_id', true)::uuid
            ELSE NULL
          END
        )
        WITH CHECK (
          id = CASE
            WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
            THEN current_setting('app.current_tenant_id', true)::uuid
            ELSE NULL
          END
        )
        """
    )

    # 2. Update tenant tables policies
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.execute(
            f"""
            CREATE POLICY tenant_isolation_{table} ON {table}
            FOR ALL
            USING (
              tenant_id = CASE
                WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{{36}}$'
                THEN current_setting('app.current_tenant_id', true)::uuid
                ELSE NULL
              END
            )
            WITH CHECK (
              tenant_id = CASE
                WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{{36}}$'
                THEN current_setting('app.current_tenant_id', true)::uuid
                ELSE NULL
              END
            )
            """
        )

    # 3. Include departments only when that table exists
    op.execute(
        """
        DO $$
        BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'departments') THEN
            DROP POLICY IF EXISTS tenant_isolation_departments ON departments;
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
            );
          END IF;
        END $$;
        """
    )


def downgrade() -> None:
    op.execute("DROP POLICY IF EXISTS tenant_isolation_tenants ON tenants")
    op.execute(
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
        """
    )
    for table in TENANT_TABLES:
        op.execute(f"DROP POLICY IF EXISTS tenant_isolation_{table} ON {table}")
        op.execute(
            f"""
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
        )

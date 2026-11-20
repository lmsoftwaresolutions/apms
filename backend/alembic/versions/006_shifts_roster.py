"""Shifts templates, shift sessions, roster patterns, and dated shift instances.

Revision ID: 006_shifts_roster
Revises: 005_raw_punch_attendance
Create Date: 2026-11-20
"""

from alembic import op

revision = "006_shifts_roster"
down_revision = "005_raw_punch_attendance"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("shift.template.create", "shift", "template", "create", "Create shift templates"),
    ("shift.template.read", "shift", "template", "read", "Read shift templates"),
    ("shift.template.update", "shift", "template", "update", "Update shift templates"),
    ("shift.template.delete", "shift", "template", "delete", "Delete shift templates"),
    ("roster.pattern.create", "roster", "pattern", "create", "Create roster patterns"),
    ("roster.pattern.read", "roster", "pattern", "read", "Read roster patterns"),
    ("roster.pattern.update", "roster", "pattern", "update", "Update roster patterns"),
    ("roster.pattern.delete", "roster", "pattern", "delete", "Delete roster patterns"),
    ("roster.instance.create", "roster", "instance", "create", "Materialize/create dated shift instances"),
    ("roster.instance.read", "roster", "instance", "read", "Read dated shift instances"),
    ("roster.instance.update", "roster", "instance", "update", "Update/override/cancel dated shift instances"),
    ("roster.instance.delete", "roster", "instance", "delete", "Delete dated shift instances"),
)

STATEMENTS = [
    # 1. Shift Templates
    """
    CREATE TABLE shift_templates (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      code varchar(50) NOT NULL,
      name varchar(200) NOT NULL,
      shift_type varchar(30) NOT NULL DEFAULT 'FIXED',
      is_overnight boolean NOT NULL DEFAULT false,
      is_active boolean NOT NULL DEFAULT true,
      color_code varchar(20),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_shift_templates_tenant_code UNIQUE (tenant_id, code),
      CONSTRAINT uq_shift_templates_tenant_id UNIQUE (tenant_id, id)
    )
    """,
    "CREATE INDEX ix_shift_templates_tenant_active ON shift_templates (tenant_id, is_active)",
    "ALTER TABLE shift_templates ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE shift_templates FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_shift_templates ON shift_templates
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON shift_templates TO apms_app",

    # 2. Shift Sessions (Relational child table of shift templates)
    """
    CREATE TABLE shift_sessions (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      shift_template_id uuid NOT NULL,
      session_order integer NOT NULL DEFAULT 1,
      name varchar(100) NOT NULL DEFAULT 'Session',
      start_time time NOT NULL,
      end_time time NOT NULL,
      pre_window_minutes integer NOT NULL DEFAULT 60,
      post_window_minutes integer NOT NULL DEFAULT 120,
      grace_period_late_minutes integer NOT NULL DEFAULT 15,
      grace_period_early_minutes integer NOT NULL DEFAULT 15,
      min_presence_ratio numeric(3, 2) NOT NULL DEFAULT 0.50,
      break_duration_minutes integer NOT NULL DEFAULT 0,
      is_overnight boolean NOT NULL DEFAULT false,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_shift_sessions_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_shift_sessions_template_order UNIQUE (tenant_id, shift_template_id, session_order),
      CONSTRAINT fk_shift_session_template FOREIGN KEY (tenant_id, shift_template_id)
        REFERENCES shift_templates (tenant_id, id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_shift_sessions_template ON shift_sessions (tenant_id, shift_template_id)",
    "ALTER TABLE shift_sessions ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE shift_sessions FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_shift_sessions ON shift_sessions
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON shift_sessions TO apms_app",

    # 3. Roster Patterns (Repeating rotational pattern definitions)
    """
    CREATE TABLE roster_patterns (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      code varchar(50) NOT NULL,
      name varchar(200) NOT NULL,
      cycle_length_days smallint NOT NULL DEFAULT 7,
      day_shift_mapping jsonb NOT NULL DEFAULT '[]',
      is_active boolean NOT NULL DEFAULT true,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_roster_patterns_tenant_code UNIQUE (tenant_id, code),
      CONSTRAINT uq_roster_patterns_tenant_id UNIQUE (tenant_id, id)
    )
    """,
    "ALTER TABLE roster_patterns ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE roster_patterns FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_roster_patterns ON roster_patterns
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON roster_patterns TO apms_app",

    # 4. Dated Shift Instances (Materialized concrete shifts, ADR-15)
    """
    CREATE TABLE dated_shift_instances (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      employee_id uuid NOT NULL,
      calendar_date date NOT NULL,
      shift_template_id uuid,
      roster_pattern_id uuid,
      status varchar(30) NOT NULL DEFAULT 'SCHEDULED',
      resolution_mode varchar(50) NOT NULL DEFAULT 'ROSTER_PATTERN',
      sessions jsonb NOT NULL DEFAULT '[]',
      is_rest_day boolean NOT NULL DEFAULT false,
      is_adhoc_modified boolean NOT NULL DEFAULT false,
      modified_by_user_id uuid,
      modification_reason varchar(255),
      modified_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_dated_shift_instances_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_dated_shift_instance_emp_date UNIQUE (tenant_id, employee_id, calendar_date),
      CONSTRAINT fk_dated_shift_employee FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employees (tenant_id, id) ON DELETE CASCADE,
      CONSTRAINT fk_dated_shift_template FOREIGN KEY (tenant_id, shift_template_id)
        REFERENCES shift_templates (tenant_id, id) ON DELETE SET NULL,
      CONSTRAINT fk_dated_shift_pattern FOREIGN KEY (tenant_id, roster_pattern_id)
        REFERENCES roster_patterns (tenant_id, id) ON DELETE SET NULL
    )
    """,
    "CREATE INDEX ix_dated_shift_instances_emp_date ON dated_shift_instances (tenant_id, employee_id, calendar_date)",
    "ALTER TABLE dated_shift_instances ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE dated_shift_instances FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_dated_shift_instances ON dated_shift_instances
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON dated_shift_instances TO apms_app",
]


def upgrade() -> None:
    for statement in STATEMENTS:
        op.execute(statement)

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


def downgrade() -> None:
    codes = ", ".join(f"'{p[0]}'" for p in PERMISSIONS)
    op.execute(
        f"""
        DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE code IN ({codes}))
        """
    )
    op.execute(f"DELETE FROM permissions WHERE code IN ({codes})")
    op.execute("DROP TABLE IF EXISTS dated_shift_instances CASCADE")
    op.execute("DROP TABLE IF EXISTS roster_patterns CASCADE")
    op.execute("DROP TABLE IF EXISTS shift_sessions CASCADE")
    op.execute("DROP TABLE IF EXISTS shift_templates CASCADE")

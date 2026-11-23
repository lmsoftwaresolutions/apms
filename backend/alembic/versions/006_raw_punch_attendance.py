"""Raw punch ingest, normalized punch events, daily attendance, and explanation traces.

Revision ID: 006_raw_punch_attendance
Revises: 005_employees
Create Date: 2026-11-20
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "006_raw_punch_attendance"
down_revision = "005_employees"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("capture.punch.ingest", "capture", "punch", "create", "Ingest raw punches"),
    ("capture.punch.read", "capture", "punch", "read", "Read punch events"),
    ("attendance.daily.read", "attendance", "daily", "read", "Read daily attendance records"),
    ("attendance.daily.recalculate", "attendance", "daily", "update", "Recalculate attendance records"),
    ("attendance.trace.read", "attendance", "trace", "read", "Read attendance explanation traces"),
)

STATEMENTS = [
    # 1. Raw Envelope (Append-Only)
    """
    CREATE TABLE raw_envelope (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      source varchar(50) NOT NULL,
      device_identifier varchar(100),
      raw_payload jsonb NOT NULL,
      payload_hash varchar(64) NOT NULL,
      received_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_raw_envelope_tenant_id UNIQUE (tenant_id, id)
    )
    """,
    "CREATE INDEX ix_raw_envelope_tenant_hash ON raw_envelope (tenant_id, payload_hash)",
    "ALTER TABLE raw_envelope ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE raw_envelope FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_raw_envelope ON raw_envelope
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
    "GRANT SELECT, INSERT ON raw_envelope TO apms_app",

    # 2. Punch Event (Normalized, Append-Only)
    """
    CREATE TABLE punch_event (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      raw_envelope_id uuid NOT NULL,
      employee_id uuid NOT NULL,
      punch_time timestamptz NOT NULL,
      punch_direction varchar(20) NOT NULL DEFAULT 'UNKNOWN',
      source varchar(50) NOT NULL,
      status varchar(30) NOT NULL DEFAULT 'ACTIVE',
      location_meta jsonb,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_punch_event_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_punch_employee FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
      CONSTRAINT fk_punch_envelope FOREIGN KEY (tenant_id, raw_envelope_id)
        REFERENCES raw_envelope (tenant_id, id) ON DELETE RESTRICT
    )
    """,
    "CREATE INDEX ix_punch_event_lookup ON punch_event (tenant_id, employee_id, punch_time)",
    "ALTER TABLE punch_event ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE punch_event FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_punch_event ON punch_event
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
    "GRANT SELECT, INSERT ON punch_event TO apms_app",

    # 3. Attendance Daily Records
    """
    CREATE TABLE attendance_daily_records (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      employee_id uuid NOT NULL,
      calendar_date date NOT NULL,
      dated_shift_instance_id uuid,
      status varchar(30) NOT NULL,
      worked_duration_minutes integer NOT NULL DEFAULT 0,
      scheduled_duration_minutes integer NOT NULL DEFAULT 0,
      worked_ratio numeric(5,4) NOT NULL DEFAULT 0.0000,
      late_minutes integer NOT NULL DEFAULT 0,
      early_departure_minutes integer NOT NULL DEFAULT 0,
      overtime_minutes integer NOT NULL DEFAULT 0,
      is_single_punch boolean NOT NULL DEFAULT false,
      anomaly_code varchar(50),
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_attendance_daily_record_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_attendance_employee_date UNIQUE (tenant_id, employee_id, calendar_date),
      CONSTRAINT fk_attendance_employee FOREIGN KEY (tenant_id, employee_id)
        REFERENCES employees (tenant_id, id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_attendance_date ON attendance_daily_records (tenant_id, calendar_date)",
    "ALTER TABLE attendance_daily_records ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE attendance_daily_records FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_attendance_daily_records ON attendance_daily_records
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON attendance_daily_records TO apms_app",

    # 4. Attendance Explanation Traces (Immutable JSON Audit Trace)
    """
    CREATE TABLE attendance_explanation_traces (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      attendance_record_id uuid NOT NULL,
      employee_id uuid NOT NULL,
      calendar_date date NOT NULL,
      trace_payload jsonb NOT NULL,
      evaluated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_attendance_trace_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT fk_attendance_trace_record FOREIGN KEY (tenant_id, attendance_record_id)
        REFERENCES attendance_daily_records (tenant_id, id) ON DELETE CASCADE
    )
    """,
    "CREATE INDEX ix_attendance_trace_lookup ON attendance_explanation_traces (tenant_id, attendance_record_id, evaluated_at DESC)",
    "ALTER TABLE attendance_explanation_traces ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE attendance_explanation_traces FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_attendance_explanation_traces ON attendance_explanation_traces
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
    "GRANT SELECT, INSERT ON attendance_explanation_traces TO apms_app",
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
    bind.execute(GRANT_TENANT_ADMIN, {"codes": [item[0] for item in PERMISSIONS]})


def downgrade() -> None:
    codes = [item[0] for item in PERMISSIONS]
    bind = op.get_bind()
    bind.execute(DELETE_ROLE_GRANTS, {"codes": codes})
    bind.execute(DELETE_PERMISSIONS, {"codes": codes})
    op.execute("DROP TABLE IF EXISTS attendance_explanation_traces CASCADE")
    op.execute("DROP TABLE IF EXISTS attendance_daily_records CASCADE")
    op.execute("DROP TABLE IF EXISTS punch_event CASCADE")
    op.execute("DROP TABLE IF EXISTS raw_envelope CASCADE")

"""Consent ledger, PII unmask audit, rollup failures, regularization, trace restrict.

Revision ID: 011_attendance_foundation
Revises: 010_designations_and_employee_fk
Create Date: 2026-11-24
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "011_attendance_foundation"
down_revision = "010_designations_and_employee_fk"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("privacy.consent.read", "privacy", "consent", "read", "Read biometric consent events"),
    ("privacy.pii.unmask", "privacy", "pii", "read", "Reveal an encrypted employee identifier"),
    ("ess.calendar.read", "ess", "calendar", "read", "Read the signed-in employee's attendance calendar"),
    ("attendance.regularization.create", "attendance", "regularization", "create", "Request a missing-punch correction"),
    ("attendance.regularization.read", "attendance", "regularization", "read", "Read regularization requests"),
    ("attendance.regularization.review", "attendance", "regularization", "update", "Approve or reject a regularization"),
    ("attendance.rollup.read", "attendance", "rollup", "read", "Read attendance rollup failures"),
)

ROLE_GRANTS = (
    (
        "TENANT_ADMIN",
        [item[0] for item in PERMISSIONS],
    ),
    (
        "SUPERVISOR",
        (
            "attendance.regularization.read",
            "attendance.regularization.review",
            "attendance.rollup.read",
        ),
    ),
    (
        "EMPLOYEE",
        (
            "ess.calendar.read",
            "attendance.regularization.create",
            "attendance.regularization.read",
        ),
    ),
)


def _policy(table: str) -> str:
    match = """
      tenant_id = CASE
        WHEN current_setting('app.current_tenant_id', true) ~ '^[0-9a-fA-F-]{36}$'
        THEN current_setting('app.current_tenant_id', true)::uuid
        ELSE NULL
      END
    """
    return f"""
    CREATE POLICY tenant_isolation_{table} ON {table}
    FOR ALL
    USING ({match})
    WITH CHECK ({match})
    """


def _tenant_table(table: str, body: str, grants: str) -> list[str]:
    return [
        body,
        f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
        f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY",
        _policy(table),
        f"GRANT {grants} ON {table} TO apms_app",
    ]


STATEMENTS = [
    """
    ALTER TABLE attendance_explanation_traces
      DROP CONSTRAINT fk_attendance_trace_record
    """,
    """
    ALTER TABLE attendance_explanation_traces
      ADD CONSTRAINT fk_attendance_trace_record
      FOREIGN KEY (tenant_id, attendance_record_id)
      REFERENCES attendance_daily_records (tenant_id, id)
      ON DELETE RESTRICT
    """,
    *_tenant_table(
        "consent_events",
        """
        CREATE TABLE consent_events (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          action varchar(20) NOT NULL,
          purpose text NOT NULL,
          retention text NOT NULL,
          actor_user_id uuid,
          recorded_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_consent_events_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_consent_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_consent_action CHECK (action IN ('GRANTED', 'WITHDRAWN'))
        )
        """,
        "SELECT, INSERT",
    ),
    *_tenant_table(
        "pii_access_audits",
        """
        CREATE TABLE pii_access_audits (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          actor_user_id uuid NOT NULL,
          field_name varchar(40) NOT NULL,
          accessed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_pii_access_audits_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_pii_audit_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT
        )
        """,
        "SELECT, INSERT",
    ),
    *_tenant_table(
        "attendance_rollup_failures",
        """
        CREATE TABLE attendance_rollup_failures (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          calendar_date date NOT NULL,
          error_title varchar(200) NOT NULL,
          error_detail text NOT NULL,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_attendance_rollup_failures_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_rollup_failure_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT
        )
        """,
        "SELECT, INSERT",
    ),
    *_tenant_table(
        "attendance_regularizations",
        """
        CREATE TABLE attendance_regularizations (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          calendar_date date NOT NULL,
          request_type varchar(20) NOT NULL,
          requested_in timestamptz,
          requested_out timestamptz,
          reason text NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'PENDING',
          approver_user_id uuid,
          approver_comment text,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_attendance_regularizations_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_regularization_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_regularization_type CHECK (request_type IN ('MISSED_IN', 'MISSED_OUT', 'BOTH', 'ON_DUTY')),
          CONSTRAINT ck_regularization_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'))
        )
        """,
        "SELECT, INSERT, UPDATE",
    ),
]

INSERT_PERMISSION = text(
    """
    INSERT INTO permissions (code, module, resource, action, description)
    VALUES (:code, :module, :resource, :action, :description)
    ON CONFLICT (code) DO NOTHING
    """
)
GRANT_ROLE = text(
    """
    INSERT INTO role_permissions (tenant_id, role_id, permission_id)
    SELECT r.tenant_id, r.id, p.id
    FROM roles r
    JOIN permissions p ON p.code IN :codes
    WHERE r.code = :role_code
    ON CONFLICT ON CONSTRAINT uq_role_permission DO NOTHING
    """
).bindparams(bindparam("codes", expanding=True))
DELETE_ROLE_GRANTS = text(
    """
    DELETE FROM role_permissions
    WHERE permission_id IN (SELECT id FROM permissions WHERE code IN :codes)
    """
).bindparams(bindparam("codes", expanding=True))
DELETE_PERMISSIONS = text("DELETE FROM permissions WHERE code IN :codes").bindparams(
    bindparam("codes", expanding=True)
)


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
    for role_code, codes in ROLE_GRANTS:
        bind.execute(GRANT_ROLE, {"role_code": role_code, "codes": list(codes)})


def downgrade() -> None:
    codes = [item[0] for item in PERMISSIONS]
    bind = op.get_bind()
    bind.execute(DELETE_ROLE_GRANTS, {"codes": codes})
    bind.execute(DELETE_PERMISSIONS, {"codes": codes})
    op.execute("DROP TABLE IF EXISTS attendance_regularizations")
    op.execute("DROP TABLE IF EXISTS attendance_rollup_failures")
    op.execute("DROP TABLE IF EXISTS pii_access_audits")
    op.execute("DROP TABLE IF EXISTS consent_events")
    op.execute("ALTER TABLE attendance_explanation_traces DROP CONSTRAINT fk_attendance_trace_record")
    op.execute(
        """
        ALTER TABLE attendance_explanation_traces
          ADD CONSTRAINT fk_attendance_trace_record
          FOREIGN KEY (tenant_id, attendance_record_id)
          REFERENCES attendance_daily_records (tenant_id, id)
          ON DELETE CASCADE
        """
    )

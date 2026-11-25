"""Granular WFH & Overtime (OT) Controls, Scoped Overrides & Comp-Off Ledger.

Revision ID: 015_overtime_and_compoff
Revises: 014_work_modes_and_controls
Create Date: 2026-11-24
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "015_overtime_and_compoff"
down_revision = "014_work_modes_and_controls"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("policy_override:create", "policy_override", "override", "create", "Create policy scope overrides"),
    ("policy_override:read", "policy_override", "override", "read", "Read policy scope overrides"),
    ("policy_override:update", "policy_override", "override", "update", "Update policy scope overrides"),
    ("policy_override:delete", "policy_override", "override", "delete", "Delete policy scope overrides"),
    ("overtime_record:create", "overtime_record", "record", "create", "Create overtime records"),
    ("overtime_record:read", "overtime_record", "record", "read", "Read overtime records"),
    ("overtime_record:update", "overtime_record", "record", "update", "Review, approve, or convert overtime records"),
    ("policy.override.create", "policy", "override", "create", "Create policy scope overrides (dot alias)"),
    ("policy.override.read", "policy", "override", "read", "Read policy scope overrides (dot alias)"),
    ("policy.override.update", "policy", "override", "update", "Update policy scope overrides (dot alias)"),
    ("policy.override.delete", "policy", "override", "delete", "Delete policy scope overrides (dot alias)"),
    ("overtime.record.create", "overtime", "record", "create", "Create overtime records (dot alias)"),
    ("overtime.record.read", "overtime", "record", "read", "Read overtime records (dot alias)"),
    ("overtime.record.update", "overtime", "record", "update", "Review, approve, or convert overtime records (dot alias)"),
)

ROLE_GRANTS = (
    ("TENANT_ADMIN", [item[0] for item in PERMISSIONS]),
    (
        "SUPERVISOR",
        (
            "overtime_record:create",
            "overtime_record:read",
            "overtime_record:update",
            "policy_override:read",
            "overtime.record.create",
            "overtime.record.read",
            "overtime.record.update",
            "policy.override.read",
        ),
    ),
    (
        "EMPLOYEE",
        (
            "overtime_record:read",
            "overtime.record.read",
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
    ALTER TABLE policy_master
      ADD COLUMN allow_wfh boolean NOT NULL DEFAULT true,
      ADD COLUMN allow_overtime boolean NOT NULL DEFAULT true,
      ADD COLUMN wfh_ot_requires_approval boolean NOT NULL DEFAULT true,
      ADD COLUMN ot_auto_approve_threshold_minutes integer,
    """,
    """
    ALTER TABLE policy_master DROP CONSTRAINT IF EXISTS ck_policy_ot_approval_mode
    """,
    """
    ALTER TABLE policy_master ADD CONSTRAINT ck_policy_ot_approval_mode CHECK (
      ot_approval_mode IN (
        'ALWAYS_REQUIRE_APPROVAL',
        'AUTO_APPROVE_ALL',
        'AUTO_APPROVE_BELOW_THRESHOLD',
        'WFH_ONLY',
        'THRESHOLD_BASED',
        'DISABLED'
      )
    )
    """,
    """
    ALTER TABLE policy_master
      ALTER COLUMN ot_multiplier DROP DEFAULT,
      ALTER COLUMN ot_multiplier DROP NOT NULL,
      ADD COLUMN extra_hours_amount numeric(12, 2),
      ADD COLUMN extra_hours_amount_unit varchar(10),
      ADD COLUMN wfh_auto_approval_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN overtime_auto_approval_enabled boolean NOT NULL DEFAULT false,
      ADD COLUMN quarterly_ot_cap_minutes integer,
      ADD COLUMN comp_off_minutes_per_day integer,
      ALTER COLUMN wfh_monthly_auto_quota DROP DEFAULT,
      ALTER COLUMN wfh_monthly_auto_quota DROP NOT NULL,
      ADD CONSTRAINT ck_policy_extra_hours_unit CHECK (
        extra_hours_amount_unit IS NULL OR extra_hours_amount_unit IN ('MINUTE', 'HOUR', 'DAY')
      ),
      ADD CONSTRAINT ck_policy_extra_hours_amount CHECK (
        extra_hours_amount IS NULL OR extra_hours_amount >= 0
      ),
      ADD CONSTRAINT ck_policy_extra_hours_pair CHECK (
        extra_hours_amount IS NULL
        OR extra_hours_amount = 0
        OR extra_hours_amount_unit IS NOT NULL
      )
    """,
    *_tenant_table(
        "policy_scope_overrides",
        """
        CREATE TABLE policy_scope_overrides (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          policy_id uuid,
          scope_type varchar(20) NOT NULL,
          scope_id uuid NOT NULL,
          allow_wfh boolean,
          wfh_monthly_quota integer,
          wfh_quota_mode varchar(20) NOT NULL DEFAULT 'ABSOLUTE',
          allow_overtime boolean,
          ot_approval_mode varchar(30),
          allow_wfh_overtime boolean,
          wfh_ot_requires_approval boolean,
          is_active boolean NOT NULL DEFAULT true,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_policy_scope_overrides_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT uq_policy_scope_tenant_type_id UNIQUE (tenant_id, scope_type, scope_id),
          CONSTRAINT ck_policy_scope_type CHECK (scope_type IN ('EMPLOYEE', 'DEPARTMENT', 'DESIGNATION')),
          CONSTRAINT ck_policy_scope_wfh_quota_mode CHECK (wfh_quota_mode IN ('ABSOLUTE', 'ADDITIVE')),
          CONSTRAINT fk_policy_scope_policy FOREIGN KEY (tenant_id, policy_id)
            REFERENCES policy_master (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_policy_scope_ot_mode CHECK (
            ot_approval_mode IS NULL OR ot_approval_mode IN (
              'ALWAYS_REQUIRE_APPROVAL',
              'AUTO_APPROVE_ALL',
              'AUTO_APPROVE_BELOW_THRESHOLD',
              'WFH_ONLY',
              'THRESHOLD_BASED',
              'DISABLED'
            )
          )
        )
        """,
        "SELECT, INSERT, UPDATE, DELETE",
    ),
    "CREATE INDEX ix_policy_scope_overrides_scope ON policy_scope_overrides (tenant_id, scope_type, scope_id, is_active)",
    """
    CREATE TABLE statutory_ot_caps (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      state_code varchar(10) NOT NULL,
      quarterly_cap_hours integer,
      daily_cap_hours integer,
      effective_from date NOT NULL,
      effective_to date,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_statutory_ot_caps_state_eff UNIQUE (state_code, effective_from)
    )
    """,
    "GRANT SELECT ON statutory_ot_caps TO apms_app",
    *_tenant_table(
        "overtime_records",
        """
        CREATE TABLE overtime_records (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          attendance_record_id uuid NOT NULL,
          employee_id uuid NOT NULL,
          overtime_date date NOT NULL,
          raw_overtime_minutes integer NOT NULL DEFAULT 0,
          approved_overtime_minutes integer NOT NULL DEFAULT 0,
          rate_multiplier numeric(3, 2),
          extra_hours_amount numeric(12, 2),
          extra_hours_amount_unit varchar(10),
          status varchar(30) NOT NULL DEFAULT 'UNREVIEWED',
          comp_off_leave_transaction_id uuid REFERENCES leave_transactions(id) ON DELETE SET NULL,
          supervisor_id uuid REFERENCES users(id) ON DELETE SET NULL,
          decision_reason text,
          reviewed_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_overtime_records_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT uq_overtime_records_tenant_att UNIQUE (tenant_id, attendance_record_id),
          CONSTRAINT fk_overtime_records_attendance FOREIGN KEY (tenant_id, attendance_record_id)
            REFERENCES attendance_daily_records (tenant_id, id) ON DELETE CASCADE,
          CONSTRAINT fk_overtime_records_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_overtime_records_status CHECK (
            status IN ('UNREVIEWED', 'APPROVED_FOR_PAY', 'CONVERTED_TO_COMPOFF', 'REJECTED')
          ),
          CONSTRAINT ck_overtime_extra_hours_unit CHECK (
            extra_hours_amount_unit IS NULL OR extra_hours_amount_unit IN ('MINUTE', 'HOUR', 'DAY')
          ),
          CONSTRAINT ck_overtime_extra_hours_amount CHECK (
            extra_hours_amount IS NULL OR extra_hours_amount >= 0
          )
        )
        """,
        "SELECT, INSERT, UPDATE, DELETE",
    ),
    "CREATE INDEX ix_overtime_records_emp_date ON overtime_records (tenant_id, employee_id, overtime_date)",
    "CREATE INDEX ix_overtime_records_status ON overtime_records (tenant_id, status)",
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
    WHERE permission_id IN (
      SELECT id FROM permissions WHERE code IN :codes
    )
    """
).bindparams(bindparam("codes", expanding=True))
DELETE_PERMISSIONS = text("DELETE FROM permissions WHERE code IN :codes").bindparams(
    bindparam("codes", expanding=True)
)


def upgrade() -> None:
    conn = op.get_bind()
    for statement in STATEMENTS:
        conn.execute(text(statement))
    for code, module, resource, action, description in PERMISSIONS:
        conn.execute(
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
        conn.execute(GRANT_ROLE, {"role_code": role_code, "codes": list(codes)})


def downgrade() -> None:
    conn = op.get_bind()
    all_codes = [item[0] for item in PERMISSIONS]
    conn.execute(DELETE_ROLE_GRANTS, {"codes": all_codes})
    conn.execute(DELETE_PERMISSIONS, {"codes": all_codes})
    conn.execute(text("DROP TABLE IF EXISTS overtime_records CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS statutory_ot_caps CASCADE"))
    conn.execute(text("DROP TABLE IF EXISTS policy_scope_overrides CASCADE"))
    conn.execute(
        text(
            """
            ALTER TABLE policy_master
              DROP COLUMN IF EXISTS allow_wfh,
              DROP COLUMN IF EXISTS allow_overtime,
              DROP COLUMN IF EXISTS wfh_ot_requires_approval,
              DROP COLUMN IF EXISTS ot_auto_approve_threshold_minutes
            """
        )
    )
    conn.execute(text("ALTER TABLE policy_master DROP CONSTRAINT IF EXISTS ck_policy_ot_approval_mode"))
    conn.execute(text("ALTER TABLE policy_master DROP CONSTRAINT IF EXISTS ck_policy_extra_hours_unit"))
    conn.execute(text("ALTER TABLE policy_master DROP CONSTRAINT IF EXISTS ck_policy_extra_hours_amount"))
    conn.execute(text("ALTER TABLE policy_master DROP CONSTRAINT IF EXISTS ck_policy_extra_hours_pair"))
    conn.execute(
        text(
            """
            ALTER TABLE policy_master
              DROP COLUMN IF EXISTS extra_hours_amount_unit,
              DROP COLUMN IF EXISTS extra_hours_amount,
              DROP COLUMN IF EXISTS wfh_auto_approval_enabled,
              DROP COLUMN IF EXISTS overtime_auto_approval_enabled,
              DROP COLUMN IF EXISTS quarterly_ot_cap_minutes,
              DROP COLUMN IF EXISTS comp_off_minutes_per_day
            """
        )
    )
    conn.execute(text("UPDATE policy_master SET wfh_monthly_auto_quota = 4 WHERE wfh_monthly_auto_quota IS NULL"))
    conn.execute(text("ALTER TABLE policy_master ALTER COLUMN wfh_monthly_auto_quota SET DEFAULT 4"))
    conn.execute(text("ALTER TABLE policy_master ALTER COLUMN wfh_monthly_auto_quota SET NOT NULL"))
    conn.execute(text("UPDATE policy_master SET ot_multiplier = 1.50 WHERE ot_multiplier IS NULL"))
    conn.execute(text("ALTER TABLE policy_master ALTER COLUMN ot_multiplier SET DEFAULT 1.50"))
    conn.execute(text("ALTER TABLE policy_master ALTER COLUMN ot_multiplier SET NOT NULL"))
    conn.execute(
        text(
            """
            ALTER TABLE policy_master ADD CONSTRAINT ck_policy_ot_approval_mode CHECK (
              ot_approval_mode IN ('ALWAYS_REQUIRE_APPROVAL')
            )
            """
        )
    )

"""Shift Attendance Policy Master — policy-linked shift templates.

Revision ID: 013_shift_attendance_policy
Revises: 012_leave_and_muster
Create Date: 2026-11-24
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "013_shift_attendance_policy"
down_revision = "012_leave_and_muster"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("policy.master.create", "policy", "master", "create", "Create attendance policies"),
    ("policy.master.read", "policy", "master", "read", "Read attendance policies"),
    ("policy.master.update", "policy", "master", "update", "Update attendance policies"),
    ("policy.master.delete", "policy", "master", "delete", "Delete attendance policies"),
)

ROLE_GRANTS = (
    ("TENANT_ADMIN", [item[0] for item in PERMISSIONS]),
    ("SUPERVISOR", ("policy.master.read",)),
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
    *_tenant_table(
        "policy_master",
        """
        CREATE TABLE policy_master (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          code varchar(30) NOT NULL,
          name varchar(120) NOT NULL,
          description text,
          is_active boolean NOT NULL DEFAULT true,
          late_arrival_allow_minutes integer NOT NULL DEFAULT 0,
          early_departure_allow_minutes integer NOT NULL DEFAULT 0,
          early_arrival_ignore_minutes integer NOT NULL DEFAULT 0,
          late_departure_ignore_minutes integer NOT NULL DEFAULT 0,
          half_day_work_duration_minutes integer NOT NULL DEFAULT 240,
          full_day_work_duration_minutes integer NOT NULL DEFAULT 480,
          half_day_late_cutoff_minutes integer,
          absent_late_cutoff_minutes integer,
          ot_minimum_minutes integer NOT NULL DEFAULT 30,
          ot_multiplier numeric(3, 2) NOT NULL DEFAULT 1.50,
          max_ot_minutes_per_day integer,
          in_out_rule varchar(30) NOT NULL DEFAULT 'FIRST_IN_LAST_OUT',
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_policy_master_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT uq_policy_master_tenant_code UNIQUE (tenant_id, code),
          CONSTRAINT ck_policy_in_out_rule CHECK (in_out_rule IN ('FIRST_IN_LAST_OUT', 'ALL_IN_OUT'))
        )
        """,
        "SELECT, INSERT, UPDATE, DELETE",
    ),
    "CREATE INDEX ix_policy_master_tenant_active ON policy_master (tenant_id, is_active)",
    """
    ALTER TABLE shift_templates
    ADD COLUMN policy_id uuid,
    ADD CONSTRAINT fk_shift_template_policy
      FOREIGN KEY (tenant_id, policy_id)
      REFERENCES policy_master (tenant_id, id)
      ON DELETE RESTRICT
    """,
    "CREATE INDEX ix_shift_templates_policy ON shift_templates (tenant_id, policy_id)",
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
    op.execute("ALTER TABLE shift_templates DROP CONSTRAINT IF EXISTS fk_shift_template_policy")
    op.execute("ALTER TABLE shift_templates DROP COLUMN IF EXISTS policy_id")
    op.execute("DROP TABLE IF EXISTS policy_master")

"""Work Modes (WFH / On-Duty) & Mode-Gated Policy Controls.

Revision ID: 014_work_modes_and_controls
Revises: 013_shift_attendance_policy
Create Date: 2026-11-24
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "014_work_modes_and_controls"
down_revision = "013_shift_attendance_policy"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("work_mode.request.create", "work_mode", "request", "create", "Apply for WFH or On-Duty"),
    ("work_mode.request.read", "work_mode", "request", "read", "Read work mode applications"),
    ("work_mode.request.review", "work_mode", "request", "update", "Approve or reject work mode applications"),
)

ROLE_GRANTS = (
    ("TENANT_ADMIN", [item[0] for item in PERMISSIONS]),
    (
        "SUPERVISOR",
        (
            "work_mode.request.read",
            "work_mode.request.review",
            "work_mode.request.create",
        ),
    ),
    (
        "EMPLOYEE",
        (
            "work_mode.request.create",
            "work_mode.request.read",
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
      ADD COLUMN wfh_monthly_auto_quota integer NOT NULL DEFAULT 4,
      ADD COLUMN allow_wfh_overtime boolean NOT NULL DEFAULT false,
      ADD COLUMN ot_approval_mode varchar(30) NOT NULL DEFAULT 'ALWAYS_REQUIRE_APPROVAL',
      ADD COLUMN max_free_lates_per_month integer NOT NULL DEFAULT 3,
      ADD COLUMN late_penalty_action varchar(30) NOT NULL DEFAULT 'WARNING',
      ADD CONSTRAINT ck_policy_ot_approval_mode CHECK (ot_approval_mode IN ('ALWAYS_REQUIRE_APPROVAL')),
      ADD CONSTRAINT ck_policy_late_penalty_action CHECK (late_penalty_action IN ('WARNING', 'DEDUCT_LEAVE_HALF_DAY', 'LOSS_OF_PAY')),
      ADD COLUMN late_penalty_leave_type_id uuid,
      ADD CONSTRAINT fk_policy_late_penalty_leave FOREIGN KEY (tenant_id, late_penalty_leave_type_id)
        REFERENCES leave_types (tenant_id, id) ON DELETE RESTRICT
    """,
    *_tenant_table(
        "work_mode_requests",
        """
        CREATE TABLE work_mode_requests (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          work_mode varchar(20) NOT NULL,
          calendar_date date NOT NULL,
          session_target varchar(20) NOT NULL DEFAULT 'FULL',
          reason text NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'PENDING',
          is_auto_approved boolean NOT NULL DEFAULT false,
          approver_user_id uuid REFERENCES users(id),
          decision_reason text,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_work_mode_requests_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_work_mode_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_work_mode_type CHECK (work_mode IN ('WFH', 'ON_DUTY')),
          CONSTRAINT ck_work_mode_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
          CONSTRAINT ck_work_mode_session CHECK (session_target IN ('FULL', 'FIRST_HALF', 'SECOND_HALF'))
        )
        """,
        "SELECT, INSERT, UPDATE, DELETE",
    ),
    """
    CREATE UNIQUE INDEX uq_work_mode_open_emp_date_session
      ON work_mode_requests (tenant_id, employee_id, calendar_date, session_target)
      WHERE status <> 'REJECTED'
    """,
    "CREATE INDEX ix_work_mode_requests_emp_date ON work_mode_requests (tenant_id, employee_id, calendar_date)",
    "CREATE INDEX ix_work_mode_requests_status ON work_mode_requests (tenant_id, status)",
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
    op.execute("DROP TABLE IF EXISTS work_mode_requests")
    op.execute(
        """
        ALTER TABLE policy_master
          DROP CONSTRAINT IF EXISTS ck_policy_late_penalty_action,
          DROP CONSTRAINT IF EXISTS ck_policy_ot_approval_mode,
          DROP CONSTRAINT IF EXISTS fk_policy_late_penalty_leave,
          DROP COLUMN IF EXISTS late_penalty_leave_type_id,
          DROP COLUMN IF EXISTS late_penalty_action,
          DROP COLUMN IF EXISTS max_free_lates_per_month,
          DROP COLUMN IF EXISTS ot_approval_mode,
          DROP COLUMN IF EXISTS allow_wfh_overtime,
          DROP COLUMN IF EXISTS wfh_monthly_auto_quota
        """
    )

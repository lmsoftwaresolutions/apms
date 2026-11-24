"""Leave ledger, holidays, and muster permissions.

Revision ID: 012_leave_and_muster
Revises: 011_attendance_foundation
Create Date: 2026-11-24
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "012_leave_and_muster"
down_revision = "011_attendance_foundation"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("leave.type.manage", "leave", "type", "manage", "Create leave types"),
    ("leave.holiday.manage", "leave", "holiday", "manage", "Maintain a branch holiday calendar"),
    ("leave.request.create", "leave", "request", "create", "Request leave"),
    ("leave.request.read", "leave", "request", "read", "Read leave requests and balances"),
    ("leave.request.review", "leave", "request", "update", "Approve or reject leave"),
    ("leave.ledger.credit", "leave", "ledger", "create", "Append an accrual or credit"),
    ("muster.export.read", "muster", "export", "read", "Export the muster without wages"),
)

ROLE_GRANTS = (
    ("TENANT_ADMIN", [item[0] for item in PERMISSIONS]),
    (
        "SUPERVISOR",
        (
            "leave.holiday.manage",
            "leave.request.read",
            "leave.request.review",
            "muster.export.read",
        ),
    ),
    (
        "EMPLOYEE",
        (
            "leave.request.create",
            "leave.request.read",
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
    *_tenant_table(
        "leave_types",
        """
        CREATE TABLE leave_types (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          code varchar(30) NOT NULL,
          name varchar(120) NOT NULL,
          allow_negative_balance boolean NOT NULL DEFAULT false,
          sandwich_enabled boolean NOT NULL DEFAULT false,
          CONSTRAINT uq_leave_types_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT uq_leave_types_tenant_code UNIQUE (tenant_id, code)
        )
        """,
        "SELECT, INSERT, UPDATE",
    ),
    *_tenant_table(
        "holidays",
        """
        CREATE TABLE holidays (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          branch_id uuid NOT NULL,
          calendar_date date NOT NULL,
          name varchar(160) NOT NULL,
          CONSTRAINT uq_holidays_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT uq_holidays_branch_date UNIQUE (tenant_id, branch_id, calendar_date),
          CONSTRAINT fk_holidays_branch FOREIGN KEY (tenant_id, branch_id)
            REFERENCES branches (tenant_id, id) ON DELETE RESTRICT
        )
        """,
        "SELECT, INSERT, DELETE",
    ),
    *_tenant_table(
        "leave_requests",
        """
        CREATE TABLE leave_requests (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          leave_type_id uuid NOT NULL,
          start_date date NOT NULL,
          end_date date NOT NULL,
          portion varchar(20) NOT NULL,
          days numeric(6, 1) NOT NULL,
          reason text NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'PENDING',
          approver_user_id uuid,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_leave_requests_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_leave_request_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT fk_leave_request_type FOREIGN KEY (tenant_id, leave_type_id)
            REFERENCES leave_types (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_leave_request_portion CHECK (portion IN ('FULL', 'FIRST_HALF', 'SECOND_HALF')),
          CONSTRAINT ck_leave_request_status CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
          CONSTRAINT ck_leave_request_days CHECK (days > 0)
        )
        """,
        "SELECT, INSERT, UPDATE",
    ),
    *_tenant_table(
        "leave_transactions",
        """
        CREATE TABLE leave_transactions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          employee_id uuid NOT NULL,
          leave_type_id uuid NOT NULL,
          request_id uuid,
          calendar_date date,
          entry_type varchar(20) NOT NULL,
          days numeric(6, 1) NOT NULL,
          session_target varchar(20),
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_leave_transactions_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT fk_leave_txn_employee FOREIGN KEY (tenant_id, employee_id)
            REFERENCES employees (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT fk_leave_txn_type FOREIGN KEY (tenant_id, leave_type_id)
            REFERENCES leave_types (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT fk_leave_txn_request FOREIGN KEY (tenant_id, request_id)
            REFERENCES leave_requests (tenant_id, id) ON DELETE RESTRICT,
          CONSTRAINT ck_leave_txn_type CHECK (entry_type IN ('ACCRUAL', 'CREDIT', 'DEBIT', 'LAPSE', 'LOP')),
          CONSTRAINT ck_leave_txn_days CHECK (days > 0),
          CONSTRAINT ck_leave_txn_session CHECK (session_target IS NULL OR session_target IN ('FIRST_HALF', 'SECOND_HALF'))
        )
        """,
        "SELECT, INSERT",
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
    op.execute("DROP TABLE IF EXISTS leave_transactions")
    op.execute("DROP TABLE IF EXISTS leave_requests")
    op.execute("DROP TABLE IF EXISTS holidays")
    op.execute("DROP TABLE IF EXISTS leave_types")

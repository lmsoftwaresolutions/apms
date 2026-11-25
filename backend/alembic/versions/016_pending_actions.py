"""Pending actions and probation lifecycle management.

Revision ID: 016_pending_actions
Revises: 015_overtime_and_compoff
Create Date: 2026-11-25
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "016_pending_actions"
down_revision = "015_overtime_and_compoff"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("pending_action:read", "pending_action", "action", "read", "Read pending actions"),
    ("pending_action:update", "pending_action", "action", "update", "Resolve or dismiss pending actions"),
    ("pending.action.read", "pending", "action", "read", "Read pending actions"),
    ("pending.action.update", "pending", "action", "update", "Resolve or dismiss pending actions"),
)

ROLE_GRANTS = (
    ("TENANT_ADMIN", [item[0] for item in PERMISSIONS]),
    (
        "SUPERVISOR",
        (
            "pending_action:read",
            "pending_action:update",
            "pending.action.read",
            "pending.action.update",
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
        "pending_actions",
        """
        CREATE TABLE pending_actions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          tenant_id uuid NOT NULL REFERENCES tenants(id),
          action_type varchar(50) NOT NULL,
          subject_type varchar(50) NOT NULL,
          subject_id uuid NOT NULL,
          due_date date NOT NULL,
          status varchar(20) NOT NULL DEFAULT 'PENDING',
          priority varchar(20) NOT NULL DEFAULT 'MEDIUM',
          title varchar(255) NOT NULL,
          description text,
          metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
          resolution jsonb,
          resolved_by uuid REFERENCES users(id),
          resolved_at timestamptz,
          created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
          CONSTRAINT uq_pending_actions_tenant_id UNIQUE (tenant_id, id),
          CONSTRAINT ck_pending_actions_status CHECK (status IN ('PENDING', 'RESOLVED', 'DISMISSED')),
          CONSTRAINT ck_pending_actions_priority CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL'))
        )
        """,
        "SELECT, INSERT, UPDATE, DELETE",
    ),
    "CREATE INDEX ix_pending_actions_tenant_status ON pending_actions (tenant_id, status)",
    "CREATE INDEX ix_pending_actions_tenant_type_status ON pending_actions (tenant_id, action_type, status)",
    "CREATE INDEX ix_pending_actions_subject ON pending_actions (tenant_id, subject_id, status)",
    "CREATE INDEX ix_pending_actions_due_date ON pending_actions (tenant_id, due_date)",
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
    conn.execute(text("DROP TABLE IF EXISTS pending_actions CASCADE"))

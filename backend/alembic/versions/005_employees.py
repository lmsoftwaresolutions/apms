"""Employees schema with PII vault and DPDP consent.

Revision ID: 005_employees
Revises: 004_departments
Create Date: 2026-11-23
"""

from alembic import op
from sqlalchemy import bindparam, text

revision = "005_employees"
down_revision = "004_departments"
branch_labels = None
depends_on = None

PERMISSIONS = (
    ("employee.employee.create", "employee", "employee", "create", "Create employee"),
    ("employee.employee.read", "employee", "employee", "read", "Read employees"),
    ("employee.employee.update", "employee", "employee", "update", "Update employee"),
    ("employee.employee.delete", "employee", "employee", "delete", "Delete employee"),
)

STATEMENTS = [
    """
    CREATE TABLE employees (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      tenant_id uuid NOT NULL REFERENCES tenants(id),
      user_id uuid,
      branch_id uuid NOT NULL,
      department_id uuid,
      employee_code varchar(50) NOT NULL,
      full_name varchar(300) NOT NULL,
      designation varchar(200),
      date_of_joining date NOT NULL,
      date_of_birth date,
      employment_type varchar(50) NOT NULL DEFAULT 'FULL_TIME',
      probation_end_date date,
      confirmation_date date,
      pan_encrypted text,
      aadhaar_encrypted text,
      bank_account_encrypted text,
      bank_ifsc_encrypted text,
      epf_uan varchar(50),
      esic_number varchar(50),
      is_active boolean NOT NULL DEFAULT true,
      biometric_consent_at timestamptz,
      created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
      CONSTRAINT uq_employees_tenant_id UNIQUE (tenant_id, id),
      CONSTRAINT uq_employees_tenant_code UNIQUE (tenant_id, employee_code),
      CONSTRAINT uq_employees_tenant_user UNIQUE (tenant_id, user_id),
      CONSTRAINT fk_employees_branch FOREIGN KEY (tenant_id, branch_id)
        REFERENCES branches (tenant_id, id),
      CONSTRAINT fk_employees_department FOREIGN KEY (tenant_id, department_id)
        REFERENCES departments (tenant_id, id),
      CONSTRAINT fk_employees_user FOREIGN KEY (tenant_id, user_id)
        REFERENCES users (tenant_id, id)
    )
    """,
    "ALTER TABLE employees ENABLE ROW LEVEL SECURITY",
    "ALTER TABLE employees FORCE ROW LEVEL SECURITY",
    """
    CREATE POLICY tenant_isolation_employees ON employees
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
    "GRANT SELECT, INSERT, UPDATE, DELETE ON employees TO apms_app",
]

INSERT_PERMISSION = text(
    """
    INSERT INTO permissions (code, module, resource, action, description)
    VALUES (:code, :module, :resource, :action, :description)
    ON CONFLICT (code) DO NOTHING
    """
)
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


def downgrade() -> None:
    codes = [item[0] for item in PERMISSIONS]
    bind = op.get_bind()
    bind.execute(DELETE_ROLE_GRANTS, {"codes": codes})
    bind.execute(DELETE_PERMISSIONS, {"codes": codes})
    op.execute("DROP TABLE IF EXISTS employees CASCADE")

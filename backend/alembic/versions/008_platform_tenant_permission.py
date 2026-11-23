"""Add platform.tenant.create permission for platform super administration.

Revision ID: 008_platform_tenant_permission
Revises: 007_attendance_roster_fk
Create Date: 2026-11-23
"""

from alembic import op

revision = "008_platform_tenant_permission"
down_revision = "007_attendance_roster_fk"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # 1. Insert distinct platform.tenant.create permission
    op.execute(
        """
        INSERT INTO permissions (id, code, module, resource, action, description)
        VALUES (
            gen_random_uuid(),
            'platform.tenant.create',
            'platform',
            'tenant',
            'create',
            'Platform super administrator multi-tenant management and provisioning'
        )
        ON CONFLICT (code) DO NOTHING;
        """
    )

    # 2. Grant platform.tenant.create ONLY to root platform tenant admin (North Mill)
    op.execute(
        """
        INSERT INTO role_permissions (id, tenant_id, role_id, permission_id)
        SELECT gen_random_uuid(), r.tenant_id, r.id, p.id
        FROM roles r
        JOIN tenants t ON r.tenant_id = t.id
        JOIN permissions p ON p.code = 'platform.tenant.create'
        WHERE t.subdomain = 'northmill' AND r.code = 'TENANT_ADMIN'
        ON CONFLICT DO NOTHING;
        """
    )


def downgrade() -> None:
    op.execute(
        """
        DELETE FROM role_permissions
        WHERE permission_id IN (SELECT id FROM permissions WHERE code = 'platform.tenant.create');
        DELETE FROM permissions WHERE code = 'platform.tenant.create';
        """
    )

"""Continuous multi-day duty length on a shift template.

Revision ID: 018_continuous_duty_hours
Revises: 017_branch_registration_number
Create Date: 2026-11-27
"""

from alembic import op

revision = "018_continuous_duty_hours"
down_revision = "017_branch_registration_number"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE shift_templates
          ADD COLUMN continuous_duty_hours integer,
          ADD CONSTRAINT ck_shift_templates_continuous_duty_hours
            CHECK (continuous_duty_hours IS NULL OR continuous_duty_hours IN (24, 36, 48))
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE shift_templates
          DROP CONSTRAINT IF EXISTS ck_shift_templates_continuous_duty_hours,
          DROP COLUMN IF EXISTS continuous_duty_hours
        """
    )

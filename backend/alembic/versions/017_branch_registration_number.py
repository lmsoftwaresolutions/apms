"""Branch establishment registration number for statutory muster.

Revision ID: 017_branch_registration_number
Revises: 016_pending_actions
Create Date: 2026-11-25
"""

from alembic import op

revision = "017_branch_registration_number"
down_revision = "016_pending_actions"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE branches
          ADD COLUMN registration_number varchar(80)
        """
    )


def downgrade() -> None:
    op.execute("ALTER TABLE branches DROP COLUMN registration_number")

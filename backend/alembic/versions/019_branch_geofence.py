"""Branch geofence coordinates, radius, and allowed Wi-Fi BSSIDs.

Revision ID: 019_branch_geofence
Revises: 018_continuous_duty_hours
Create Date: 2026-11-27
"""

from alembic import op

revision = "019_branch_geofence"
down_revision = "018_continuous_duty_hours"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE branches
          ADD COLUMN geofence_latitude double precision,
          ADD COLUMN geofence_longitude double precision,
          ADD COLUMN geofence_radius_m integer,
          ADD COLUMN allowed_bssids jsonb
        """
    )


def downgrade() -> None:
    op.execute(
        """
        ALTER TABLE branches
          DROP COLUMN allowed_bssids,
          DROP COLUMN geofence_radius_m,
          DROP COLUMN geofence_longitude,
          DROP COLUMN geofence_latitude
        """
    )

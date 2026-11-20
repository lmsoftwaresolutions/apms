"""Add composite foreign key constraint from attendance_daily_records to dated_shift_instances.

Revision ID: 007_attendance_roster_fk
Revises: 006_shifts_roster
Create Date: 2026-11-20
"""

from alembic import op

revision = "007_attendance_roster_fk"
down_revision = "006_shifts_roster"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        """
        ALTER TABLE attendance_daily_records
        ADD CONSTRAINT fk_attendance_dated_shift_instance
        FOREIGN KEY (tenant_id, dated_shift_instance_id)
        REFERENCES dated_shift_instances (tenant_id, id)
        ON DELETE SET NULL
        """
    )


def downgrade() -> None:
    op.execute(
        "ALTER TABLE attendance_daily_records DROP CONSTRAINT IF EXISTS fk_attendance_dated_shift_instance"
    )

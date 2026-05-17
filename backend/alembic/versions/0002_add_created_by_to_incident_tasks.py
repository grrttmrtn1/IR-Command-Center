"""Add created_by to incident_tasks

Revision ID: 0002
Revises: 0001
Create Date: 2026-05-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "incident_tasks",
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade():
    op.drop_column("incident_tasks", "created_by")

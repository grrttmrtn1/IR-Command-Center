"""add compliance tags to timeline events and tasks

Revision ID: 0011
Revises: 0010
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("timeline_events", sa.Column("tags", JSONB, nullable=False, server_default="[]"))
    op.add_column("incident_tasks", sa.Column("framework_tags", JSONB, nullable=False, server_default="[]"))


def downgrade() -> None:
    op.drop_column("timeline_events", "tags")
    op.drop_column("incident_tasks", "framework_tags")

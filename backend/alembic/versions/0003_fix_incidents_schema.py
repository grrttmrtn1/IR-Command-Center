"""Fix incidents schema: started_at server_default, incidentstatus enum value

Revision ID: 0003
Revises: 0002
Create Date: 2026-05-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0003"
down_revision = "0002"
branch_labels = None
depends_on = None


def upgrade():
    # Add server_default for started_at and backfill NULLs
    op.alter_column(
        "incidents",
        "started_at",
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
    )
    op.execute("UPDATE incidents SET started_at = created_at WHERE started_at IS NULL")

    # Add server_default for occurred_at on timeline_events
    op.alter_column(
        "timeline_events",
        "occurred_at",
        server_default=sa.func.now(),
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )

    # Fix enum value ERADICATED -> ERADICATING
    op.execute("ALTER TYPE incidentstatus RENAME VALUE 'ERADICATED' TO 'ERADICATING'")


def downgrade():
    op.execute("ALTER TYPE incidentstatus RENAME VALUE 'ERADICATING' TO 'ERADICATED'")
    op.alter_column(
        "timeline_events",
        "occurred_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=False,
    )
    op.alter_column(
        "incidents",
        "started_at",
        server_default=None,
        existing_type=sa.DateTime(timezone=True),
        existing_nullable=True,
    )

"""Fix column mismatches: iocs.type→ioc_type, affected_assets missing columns, incident_notes missing updated_at

Revision ID: 0013
Revises: 0012
Create Date: 2026-05-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # iocs: rename 'type' column to 'ioc_type' to match the ORM model attribute name
    op.alter_column("iocs", "type", new_column_name="ioc_type")

    # affected_assets: add created_by (was missing from initial migration)
    op.add_column(
        "affected_assets",
        sa.Column(
            "created_by",
            sa.String(36),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    # affected_assets: add updated_at (was missing from initial migration)
    op.add_column(
        "affected_assets",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )

    # incident_notes: add updated_at (was missing from initial migration)
    op.add_column(
        "incident_notes",
        sa.Column(
            "updated_at",
            sa.DateTime(timezone=True),
            server_default=sa.func.now(),
            nullable=False,
        ),
    )


def downgrade() -> None:
    op.drop_column("incident_notes", "updated_at")
    op.drop_column("affected_assets", "updated_at")
    op.drop_column("affected_assets", "created_by")
    op.alter_column("iocs", "ioc_type", new_column_name="type")

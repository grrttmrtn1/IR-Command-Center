"""Add incident chat messages and exercise mode

Revision ID: 0009
Revises: 0008
Create Date: 2026-05-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "incident_chat_messages",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.String(36), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("message", sa.Text, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_chat_incident_id", "incident_chat_messages", ["incident_id", "created_at"])

    op.add_column(
        "incidents",
        sa.Column("is_exercise", sa.Boolean(), nullable=False, server_default="false"),
    )


def downgrade():
    op.drop_column("incidents", "is_exercise")
    op.drop_index("idx_chat_incident_id", "incident_chat_messages")
    op.drop_table("incident_chat_messages")

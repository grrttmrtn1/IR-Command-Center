"""Add exercise facilitation and post-mortem tables

Revision ID: 0015
Revises: 0014
Create Date: 2026-05-30 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "post_mortems",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False, unique=True),
        sa.Column("summary", sa.Text),
        sa.Column("impact", sa.Text),
        sa.Column("timeline_notes", sa.Text),
        sa.Column("what_went_well", sa.Text),
        sa.Column("what_went_poorly", sa.Text),
        sa.Column("root_cause", sa.Text),
        sa.Column("five_whys", sa.JSON, server_default="[]"),
        sa.Column("lessons_learned", sa.Text),
        sa.Column("ai_generated", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "postmortem_action_items",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("postmortem_id", sa.String(36), sa.ForeignKey("post_mortems.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("owner_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL")),
        sa.Column("owner_name", sa.String(255)),
        sa.Column("due_at", sa.DateTime(timezone=True)),
        sa.Column("priority", sa.String(10), nullable=False, server_default="MEDIUM"),
        sa.Column("status", sa.String(20), nullable=False, server_default="OPEN"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_pm_action_postmortem", "postmortem_action_items", ["postmortem_id"])

    op.create_table(
        "exercise_injects",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("inject_type", sa.String(30), nullable=False, server_default="COMPLICATION"),
        sa.Column("target_phase", sa.String(30)),
        sa.Column("delivered_at", sa.DateTime(timezone=True)),
        sa.Column("facilitator_notes", sa.Text),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_inject_incident", "exercise_injects", ["incident_id"])

    op.create_table(
        "exercise_observations",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("category", sa.String(20), nullable=False, server_default="GENERAL"),
        sa.Column("content", sa.Text, nullable=False),
        sa.Column("phase", sa.String(30)),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("idx_obs_incident", "exercise_observations", ["incident_id"])


def downgrade():
    op.drop_index("idx_obs_incident", "exercise_observations")
    op.drop_table("exercise_observations")
    op.drop_index("idx_inject_incident", "exercise_injects")
    op.drop_table("exercise_injects")
    op.drop_index("idx_pm_action_postmortem", "postmortem_action_items")
    op.drop_table("postmortem_action_items")
    op.drop_table("post_mortems")

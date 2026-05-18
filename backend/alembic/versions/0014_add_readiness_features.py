"""Add playbooks, ir_plan_sections, oncall_rosters; enhance contact_lists

Revision ID: 0014
Revises: 0013
Create Date: 2026-05-17
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # playbooks
    op.create_table(
        "playbooks",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("incident_type", sa.String(50), nullable=False),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("steps", JSONB, nullable=False, server_default="[]"),
        sa.Column("tags", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_playbooks_incident_type", "playbooks", ["incident_type"])
    op.create_index("idx_playbooks_is_system", "playbooks", ["is_system"])

    # ir_plan_sections
    op.create_table(
        "ir_plan_sections",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("section_key", sa.String(50), nullable=False, unique=True),
        sa.Column("title", sa.String(255), nullable=False),
        sa.Column("content", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("last_reviewed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("reviewed_by_id", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("next_review_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("version", sa.Integer, nullable=False, server_default="1"),
        sa.Column("updated_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )
    op.create_index("idx_ir_plan_sections_key", "ir_plan_sections", ["section_key"])

    # oncall_rosters
    op.create_table(
        "oncall_rosters",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("entries", JSONB, nullable=False, server_default="[]"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("now()")),
    )

    # enhance contact_lists
    op.add_column("contact_lists", sa.Column("secondary_phone", sa.String(50), nullable=True))
    op.add_column("contact_lists", sa.Column("category", sa.String(30), nullable=False, server_default="OTHER"))
    op.add_column("contact_lists", sa.Column("escalation_order", sa.Integer, nullable=True))
    op.add_column("contact_lists", sa.Column("is_primary", sa.Boolean, nullable=False, server_default="false"))
    op.add_column("contact_lists", sa.Column("notes", sa.Text, nullable=True))
    op.add_column("contact_lists", sa.Column(
        "updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")
    ))
    op.create_index("idx_contact_lists_category", "contact_lists", ["category"])


def downgrade() -> None:
    op.drop_index("idx_contact_lists_category", "contact_lists")
    op.drop_column("contact_lists", "updated_at")
    op.drop_column("contact_lists", "notes")
    op.drop_column("contact_lists", "is_primary")
    op.drop_column("contact_lists", "escalation_order")
    op.drop_column("contact_lists", "category")
    op.drop_column("contact_lists", "secondary_phone")
    op.drop_table("oncall_rosters")
    op.drop_index("idx_ir_plan_sections_key", "ir_plan_sections")
    op.drop_table("ir_plan_sections")
    op.drop_index("idx_playbooks_is_system", "playbooks")
    op.drop_index("idx_playbooks_incident_type", "playbooks")
    op.drop_table("playbooks")

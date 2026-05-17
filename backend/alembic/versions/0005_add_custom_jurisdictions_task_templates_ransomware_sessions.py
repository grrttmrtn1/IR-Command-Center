"""Add custom_jurisdictions, task_templates, ransomware_sessions tables

Revision ID: 0005
Revises: 0004
Create Date: 2026-05-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import JSONB

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "custom_jurisdictions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("code", sa.String(50), nullable=False, unique=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("deadline_hours", sa.Integer, nullable=True),
        sa.Column("threshold", sa.Text, nullable=True),
        sa.Column("requirements", JSONB, nullable=False, server_default="[]"),
        sa.Column("contact_url", sa.String(512), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "task_templates",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_type", sa.String(50), nullable=False),
        sa.Column("title", sa.String(500), nullable=False),
        sa.Column("priority", sa.String(20), nullable=False, server_default="MEDIUM"),
        sa.Column("description", sa.Text, nullable=True),
        sa.Column("sort_order", sa.Integer, nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean, nullable=False, server_default="true"),
        sa.Column("is_system", sa.Boolean, nullable=False, server_default="false"),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )

    op.create_table(
        "ransomware_sessions",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("answers", JSONB, nullable=False, server_default="{}"),
        sa.Column("decision", sa.Text, nullable=True),
        sa.Column("decision_rationale", sa.Text, nullable=True),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now()),
    )


def downgrade():
    op.drop_table("ransomware_sessions")
    op.drop_table("task_templates")
    op.drop_table("custom_jurisdictions")

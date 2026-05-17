"""Fix assessments schema: add updated_at to assessments, evidence_doc_id to assessment_answers

Revision ID: 0004
Revises: 0003
Create Date: 2026-05-16 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0004"
down_revision = "0003"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "assessments",
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column(
        "assessment_answers",
        sa.Column("evidence_doc_id", sa.String(36), sa.ForeignKey("documents.id", ondelete="SET NULL"), nullable=True),
    )


def downgrade():
    op.drop_column("assessment_answers", "evidence_doc_id")
    op.drop_column("assessments", "updated_at")

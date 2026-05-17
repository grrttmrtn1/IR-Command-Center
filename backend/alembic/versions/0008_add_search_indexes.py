"""Add full-text search GIN indexes

Revision ID: 0008
Revises: 0007
Create Date: 2026-05-17 00:00:00.000000

"""
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade():
    op.execute(
        "CREATE INDEX idx_incidents_fts ON incidents USING GIN "
        "(to_tsvector('english', title || ' ' || COALESCE(description, '')))"
    )
    op.execute(
        "CREATE INDEX idx_iocs_fts ON iocs USING GIN "
        "(to_tsvector('english', value || ' ' || COALESCE(notes, '')))"
    )
    op.execute(
        "CREATE INDEX idx_tasks_fts ON incident_tasks USING GIN "
        "(to_tsvector('english', title || ' ' || COALESCE(description, '')))"
    )
    op.execute(
        "CREATE INDEX idx_documents_fts ON documents USING GIN "
        "(to_tsvector('english', title || ' ' || COALESCE(content, '')))"
    )
    op.execute(
        "CREATE INDEX idx_comms_fts ON comms_drafts USING GIN "
        "(to_tsvector('english', title || ' ' || COALESCE(content, '')))"
    )


def downgrade():
    op.execute("DROP INDEX IF EXISTS idx_incidents_fts")
    op.execute("DROP INDEX IF EXISTS idx_iocs_fts")
    op.execute("DROP INDEX IF EXISTS idx_tasks_fts")
    op.execute("DROP INDEX IF EXISTS idx_documents_fts")
    op.execute("DROP INDEX IF EXISTS idx_comms_fts")

"""Add vendor registry

Revision ID: 0010
Revises: 0009
Create Date: 2026-05-17 00:00:00.000000

"""
from alembic import op
import sqlalchemy as sa

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "vendors",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column(
            "vendor_type",
            sa.Enum(
                "LEGAL", "FORENSICS", "PR", "INSURANCE", "RANSOM_NEGOTIATOR", "BREACH_COACH", "OTHER",
                name="vendortype",
            ),
            nullable=False,
        ),
        sa.Column("name", sa.String(500), nullable=False),
        sa.Column("sla_response_hours", sa.Integer, nullable=True),
        sa.Column("primary_contact_name", sa.String(255), nullable=True),
        sa.Column("primary_contact_phone", sa.String(50), nullable=True),
        sa.Column("primary_contact_email", sa.String(255), nullable=True),
        sa.Column("secondary_contact_name", sa.String(255), nullable=True),
        sa.Column("secondary_contact_phone", sa.String(50), nullable=True),
        sa.Column("secondary_contact_email", sa.String(255), nullable=True),
        sa.Column("contract_start", sa.Date, nullable=True),
        sa.Column("contract_expiry", sa.Date, nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "vendor_engagements",
        sa.Column("id", sa.String(36), primary_key=True),
        sa.Column("vendor_id", sa.String(36), sa.ForeignKey("vendors.id", ondelete="CASCADE"), nullable=False),
        sa.Column("incident_id", sa.String(36), sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("engaged_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("notes", sa.Text, nullable=True),
        sa.Column("created_by", sa.String(36), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )


def downgrade():
    op.drop_table("vendor_engagements")
    op.drop_table("vendors")
    op.execute("DROP TYPE IF EXISTS vendortype")

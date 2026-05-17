"""Initial schema

Revision ID: 0001
Revises:
Create Date: 2026-01-01 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- Enum types ---
    op.execute("CREATE TYPE userrole AS ENUM ('SUPER_ADMIN', 'ADMIN', 'IR_LEAD', 'ANALYST', 'OBSERVER')")
    op.execute("CREATE TYPE incidenttype AS ENUM ('RANSOMWARE', 'DATA_BREACH', 'DDOS', 'INSIDER_THREAT', 'PHISHING', 'MALWARE', 'VULNERABILITY', 'OTHER')")
    op.execute("CREATE TYPE severity AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')")
    op.execute("CREATE TYPE incidentstatus AS ENUM ('OPEN', 'CONTAINED', 'ERADICATED', 'RECOVERING', 'CLOSED')")
    op.execute("CREATE TYPE incidentphase AS ENUM ('PREPARATION', 'DETECTION', 'ANALYSIS', 'CONTAINMENT', 'ERADICATION', 'RECOVERY', 'POST_INCIDENT')")
    op.execute("CREATE TYPE ioctype AS ENUM ('IP_ADDRESS', 'DOMAIN', 'URL', 'FILE_HASH', 'EMAIL', 'REGISTRY_KEY', 'FILENAME', 'CVE', 'USER_ACCOUNT', 'OTHER')")
    op.execute("CREATE TYPE taskstatus AS ENUM ('BACKLOG', 'TODO', 'IN_PROGRESS', 'BLOCKED', 'DONE')")
    op.execute("CREATE TYPE priority AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW')")
    op.execute("CREATE TYPE draftstatus AS ENUM ('DRAFT', 'UNDER_REVIEW', 'APPROVED', 'SENT', 'ARCHIVED')")
    op.execute("CREATE TYPE doccategory AS ENUM ('PLAYBOOK', 'PROCEDURE', 'POLICY', 'TEMPLATE', 'EVIDENCE', 'LEGAL', 'COMMUNICATION', 'TRAINING', 'OTHER')")

    # --- Users ---
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False, unique=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("role", postgresql.ENUM("SUPER_ADMIN", "ADMIN", "IR_LEAD", "ANALYST", "OBSERVER", name="userrole", create_type=False), nullable=False, server_default="ANALYST"),
        sa.Column("sso_provider", sa.String(), nullable=True),
        sa.Column("sso_id", sa.String(), nullable=True),
        sa.Column("mfa_enabled", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("mfa_secret", sa.String(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_login_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), onupdate=sa.func.now(), nullable=False),
    )
    op.create_index("ix_users_email", "users", ["email"])

    op.create_table(
        "sessions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("token_hash", sa.String(), nullable=False, unique=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "mfa_backup_codes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code_hash", sa.String(), nullable=False),
        sa.Column("used_at", sa.DateTime(timezone=True), nullable=True),
    )

    op.create_table(
        "api_keys",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("key_hash", sa.String(), nullable=False, unique=True),
        sa.Column("key_prefix", sa.String(), nullable=False),
        sa.Column("scopes", sa.String(), nullable=False, server_default=""),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("last_used_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "sso_configs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("type", sa.String(), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("config_encrypted", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Incidents ---
    op.create_table(
        "incidents",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("incident_type", postgresql.ENUM("RANSOMWARE", "DATA_BREACH", "DDOS", "INSIDER_THREAT", "PHISHING", "MALWARE", "VULNERABILITY", "OTHER", name="incidenttype", create_type=False), nullable=False),
        sa.Column("severity", postgresql.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW", name="severity", create_type=False), nullable=False),
        sa.Column("status", postgresql.ENUM("OPEN", "CONTAINED", "ERADICATED", "RECOVERING", "CLOSED", name="incidentstatus", create_type=False), nullable=False, server_default="OPEN"),
        sa.Column("phase", postgresql.ENUM("PREPARATION", "DETECTION", "ANALYSIS", "CONTAINMENT", "ERADICATION", "RECOVERY", "POST_INCIDENT", name="incidentphase", create_type=False), nullable=False, server_default="DETECTION"),
        sa.Column("lead_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("started_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("contained_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("resolved_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "iocs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("type", postgresql.ENUM("IP_ADDRESS", "DOMAIN", "URL", "FILE_HASH", "EMAIL", "REGISTRY_KEY", "FILENAME", "CVE", "USER_ACCOUNT", "OTHER", name="ioctype", create_type=False), nullable=False),
        sa.Column("value", sa.Text(), nullable=False),
        sa.Column("confidence", sa.String(), nullable=False, server_default="HIGH"),
        sa.Column("source", sa.String(), nullable=True),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "affected_assets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("asset_type", sa.String(), nullable=False),
        sa.Column("identifier", sa.String(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="UNKNOWN"),
        sa.Column("priority", postgresql.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW", name="priority", create_type=False), nullable=False, server_default="HIGH"),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "incident_notes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("author_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("is_exec_briefing", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_pinned", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "timeline_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("actor_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("actor", sa.String(), nullable=True),
        sa.Column("event_type", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("occurred_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "evidence",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("chain_of_custody", postgresql.JSONB(), nullable=True),
        sa.Column("collected_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("collected_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "incident_tasks",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="CASCADE"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("status", postgresql.ENUM("BACKLOG", "TODO", "IN_PROGRESS", "BLOCKED", "DONE", name="taskstatus", create_type=False), nullable=False, server_default="BACKLOG"),
        sa.Column("priority", postgresql.ENUM("CRITICAL", "HIGH", "MEDIUM", "LOW", name="priority", create_type=False), nullable=False, server_default="MEDIUM"),
        sa.Column("assignee_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("due_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("labels", sa.String(), nullable=True),
        sa.Column("parent_id", sa.String(), sa.ForeignKey("incident_tasks.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Documents ---
    op.create_table(
        "documents",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("category", postgresql.ENUM("PLAYBOOK", "PROCEDURE", "POLICY", "TEMPLATE", "EVIDENCE", "LEGAL", "COMMUNICATION", "TRAINING", "OTHER", name="doccategory", create_type=False), nullable=False, server_default="OTHER"),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(), nullable=True),
        sa.Column("file_size", sa.Integer(), nullable=True),
        sa.Column("mime_type", sa.String(), nullable=True),
        sa.Column("is_template", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("is_system_template", sa.Boolean(), nullable=False, server_default="false"),
        sa.Column("tags", sa.String(), nullable=True),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "document_versions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("document_id", sa.String(), sa.ForeignKey("documents.id", ondelete="CASCADE"), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("content", sa.Text(), nullable=True),
        sa.Column("file_path", sa.String(), nullable=True),
        sa.Column("changed_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("change_notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Assessments ---
    op.create_table(
        "assessment_questions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("category", sa.String(), nullable=False),
        sa.Column("subcategory", sa.String(), nullable=True),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("weight", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
    )

    op.create_table(
        "assessments",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("overall_score", sa.Float(), nullable=True),
        sa.Column("maturity_level", sa.Integer(), nullable=True),
        sa.Column("status", sa.String(), nullable=False, server_default="in_progress"),
        sa.Column("completed_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "assessment_answers",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("assessment_id", sa.String(), sa.ForeignKey("assessments.id", ondelete="CASCADE"), nullable=False),
        sa.Column("question_id", sa.String(), sa.ForeignKey("assessment_questions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("score", sa.Integer(), nullable=False),
        sa.Column("notes", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Communications ---
    op.create_table(
        "comms_drafts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("incident_id", sa.String(), sa.ForeignKey("incidents.id", ondelete="SET NULL"), nullable=True),
        sa.Column("title", sa.String(), nullable=False),
        sa.Column("jurisdiction", sa.String(), nullable=False),
        sa.Column("state", sa.String(), nullable=True),
        sa.Column("content", sa.Text(), nullable=False, server_default=""),
        sa.Column("status", postgresql.ENUM("DRAFT", "UNDER_REVIEW", "APPROVED", "SENT", "ARCHIVED", name="draftstatus", create_type=False), nullable=False, server_default="DRAFT"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("review_notes", sa.Text(), nullable=True),
        sa.Column("reviewed_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("approved_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "comms_notifications",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("draft_id", sa.String(), sa.ForeignKey("comms_drafts.id", ondelete="CASCADE"), nullable=False),
        sa.Column("method", sa.String(), nullable=False),
        sa.Column("recipient", sa.String(), nullable=False),
        sa.Column("sent_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("sent_by", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
    )

    # --- Knowledge ---
    op.create_table(
        "org_knowledge",
        sa.Column("id", sa.String(), primary_key=True, server_default="singleton"),
        sa.Column("org_name", sa.String(), nullable=True),
        sa.Column("industry", sa.String(), nullable=True),
        sa.Column("size", sa.String(), nullable=True),
        sa.Column("critical_systems", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("regulatory_obligations", postgresql.ARRAY(sa.String()), nullable=True),
        sa.Column("comm_voice", sa.Text(), nullable=True),
        sa.Column("comm_guidelines", sa.Text(), nullable=True),
        sa.Column("key_contacts", postgresql.JSONB(), nullable=True),
        sa.Column("insurance_info", postgresql.JSONB(), nullable=True),
        sa.Column("legal_counsel", postgresql.JSONB(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "ai_config",
        sa.Column("id", sa.String(), primary_key=True, server_default="singleton"),
        sa.Column("default_provider", sa.String(), nullable=False, server_default="anthropic"),
        sa.Column("providers_encrypted", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    op.create_table(
        "contact_lists",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=True),
        sa.Column("email", sa.String(), nullable=True),
        sa.Column("phone", sa.String(), nullable=True),
        sa.Column("organization", sa.String(), nullable=True),
        sa.Column("type", sa.String(), nullable=False, server_default="INTERNAL"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )

    # --- Audit ---
    op.create_table(
        "audit_logs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("api_key_id", sa.String(), sa.ForeignKey("api_keys.id", ondelete="SET NULL"), nullable=True),
        sa.Column("action", sa.String(), nullable=False),
        sa.Column("resource", sa.String(), nullable=False),
        sa.Column("resource_id", sa.String(), nullable=True),
        sa.Column("details", postgresql.JSONB(), nullable=True),
        sa.Column("ip_address", sa.String(), nullable=True),
        sa.Column("user_agent", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.create_index("ix_audit_logs_created_at", "audit_logs", ["created_at"])
    op.create_index("ix_audit_logs_user_id", "audit_logs", ["user_id"])
    op.create_index("ix_audit_logs_resource", "audit_logs", ["resource"])


def downgrade() -> None:
    op.drop_table("audit_logs")
    op.drop_table("contact_lists")
    op.drop_table("ai_config")
    op.drop_table("org_knowledge")
    op.drop_table("comms_notifications")
    op.drop_table("comms_drafts")
    op.drop_table("assessment_answers")
    op.drop_table("assessments")
    op.drop_table("assessment_questions")
    op.drop_table("document_versions")
    op.drop_table("documents")
    op.drop_table("incident_tasks")
    op.drop_table("evidence")
    op.drop_table("timeline_events")
    op.drop_table("incident_notes")
    op.drop_table("affected_assets")
    op.drop_table("iocs")
    op.drop_table("incidents")
    op.drop_table("sso_configs")
    op.drop_table("api_keys")
    op.drop_table("mfa_backup_codes")
    op.drop_table("sessions")
    op.drop_table("users")
    op.execute("DROP TYPE IF EXISTS doccategory")
    op.execute("DROP TYPE IF EXISTS draftstatus")
    op.execute("DROP TYPE IF EXISTS priority")
    op.execute("DROP TYPE IF EXISTS taskstatus")
    op.execute("DROP TYPE IF EXISTS ioctype")
    op.execute("DROP TYPE IF EXISTS incidentphase")
    op.execute("DROP TYPE IF EXISTS incidentstatus")
    op.execute("DROP TYPE IF EXISTS severity")
    op.execute("DROP TYPE IF EXISTS incidenttype")
    op.execute("DROP TYPE IF EXISTS userrole")

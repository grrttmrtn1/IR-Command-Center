from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import HTMLResponse
from app.config import settings
from app.middleware.audit import AuditMiddleware
from app.routers import auth, incidents, tasks, documents, scorecard, communications, ai, knowledge, admin, audit, ransomware, v1
from app.routers import task_templates

app = FastAPI(
    title="IR Command Center",
    description="""
## IR Command Center API

Enterprise-grade Incident Response platform providing:

- **War Room Dashboard** — IOC tracking, asset management, evidence locker, timeline
- **IR Readiness Scorecard** — Maturity assessment with gap analysis
- **Crisis Communications** — Jurisdiction-aware breach notification drafts
- **Ransomware Decision Support** — Structured conversation framework
- **Kanban Task Board** — Incident task management with AI generation
- **Document Library** — Playbooks, templates, versioned documents

### Authentication
- **Session auth** (frontend): JWT via httpOnly cookie
- **API key auth** (external): `Authorization: Bearer ircc_<key>` with scopes

### External API
All `/api/v1/` routes are the external API and require API key authentication.
Create API keys in **Admin → API Keys**.

### API Key Scopes
`incidents:read` `incidents:write` `documents:read` `tasks:read` `tasks:write` `audit:read` `comms:read`
    """,
    version="1.0.0",
    docs_url="/docs",
    redoc_url=None,
    openapi_tags=[
        {"name": "auth", "description": "Authentication (login, SSO, MFA, token refresh)"},
        {"name": "incidents", "description": "Incident management and War Room"},
        {"name": "tasks", "description": "Kanban task board (org-wide)"},
        {"name": "documents", "description": "Document library and templates"},
        {"name": "scorecard", "description": "IR Readiness Scorecard and assessments"},
        {"name": "communications", "description": "Crisis communications drafts"},
        {"name": "ransomware", "description": "Ransomware decision support framework"},
        {"name": "ai", "description": "AI provider configuration and generation endpoints"},
        {"name": "knowledge", "description": "Business knowledge base and contacts"},
        {"name": "admin", "description": "User management, SSO config, API keys"},
        {"name": "audit", "description": "Audit log access and export"},
        {"name": "External API v1", "description": "External REST API (API key auth). All endpoints require Bearer token."},
    ],
)

# CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Session (for SAML/OIDC state)
app.add_middleware(SessionMiddleware, secret_key=settings.secret_key)

# Audit logging (after routing, before response)
app.add_middleware(AuditMiddleware)

# Routers
app.include_router(auth.router)
app.include_router(incidents.router)
app.include_router(tasks.router)
app.include_router(documents.router)
app.include_router(scorecard.router)
app.include_router(communications.router)
app.include_router(ransomware.router)
app.include_router(ai.router)
app.include_router(knowledge.router)
app.include_router(admin.router)
app.include_router(audit.router)
app.include_router(v1.router)
app.include_router(task_templates.router)


@app.get("/redoc", include_in_schema=False)
async def redoc_html() -> HTMLResponse:
    return get_redoc_html(
        openapi_url="/openapi.json",
        title="IR Command Center - ReDoc",
        redoc_js_url="https://cdn.jsdelivr.net/npm/redoc@2.1.5/bundles/redoc.standalone.js",
    )


@app.get("/health", tags=["health"])
async def health():
    return {"status": "ok", "version": "1.0.0"}

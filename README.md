# IR Command Center

**Your incident response command post — from first alert to post-incident review.**

When a breach hits, your team shouldn't be juggling spreadsheets, chat threads, and disconnected tools. IR Command Center brings your entire response operation into one self-hosted platform: a live war room, structured task coordination, AI-powered communications, and the decision support your team needs under pressure.

### Why IR Command Center?

- **Built for the moment things go wrong.** Every feature is designed for the high-stress, time-critical environment of an active incident — not a compliance checkbox.
- **AI that actually helps.** Generate breach notifications, populate task boards, and get decision support from Claude, GPT-4, or Gemini — configured once, available everywhere.
- **Own your data.** Fully self-hosted with Docker Compose. Incident data, communications, and credentials never leave your infrastructure.
- **Enterprise auth, zero friction.** SAML 2.0, OIDC, TOTP MFA, and scoped API keys for SIEM/SOAR integrations — ready out of the box.
- **Covers the full lifecycle.** Ransomware negotiation decisions, jurisdiction-aware breach notifications, IR maturity scorecards, document libraries — tools most platforms charge extra for or don't offer at all.
- **Deploy in minutes.** One `.env` file, one `docker compose up`. No Kubernetes, no cloud accounts, no vendor lock-in.

---

## Features

| Module | Description |
|---|---|
| **War Room** | Centralized incident dashboard — IOC tracking, asset inventory, evidence locker, timeline, phase lifecycle bar |
| **Kanban Task Board** | Drag-and-drop task management per incident and org-wide, with AI-assisted task generation |
| **IR Readiness Scorecard** | Maturity assessments with radar chart visualization and gap analysis |
| **Crisis Communications** | AI-drafted breach notifications with jurisdiction-aware templates (US states, GDPR, etc.) and custom jurisdiction support |
| **Ransomware Decision Tool** | Guided decision framework with risk signal collection, structured documentation, and session persistence |
| **Document Library** | Playbooks, templates, and IR documents with inline Markdown editor and version history |
| **Knowledge Base** | Org-specific context: critical systems, key contacts, regulatory obligations fed to AI prompts |
| **Audit Log** | Full activity log with AI-activity tab, actor resolution, and CSV export |
| **External REST API** | Scoped API key auth for SIEM/SOAR integrations (`/api/v1/`) |
| **Admin** | User management, RBAC roles, SSO/SAML/OIDC config, API key management, task template overrides |

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | Next.js 15 (App Router), React 19, TypeScript, Tailwind CSS, shadcn/ui, Recharts |
| Backend | FastAPI, Python 3.12, SQLAlchemy 2 (async), Pydantic v2 |
| Database | PostgreSQL 16 |
| Cache | Redis 7 |
| Proxy | Nginx 1.27 |
| Auth | JWT (httpOnly cookie), TOTP MFA, SAML 2.0, OIDC |
| AI Providers | Anthropic Claude, OpenAI, Azure OpenAI, Google Gemini |

## Prerequisites

- Docker Engine 24+ and Docker Compose v2
- `openssl` (for key generation)

## Quick Start

**1. Clone and configure**

```bash
cp .env.example .env
```

Edit `.env` and set the three required values:

```bash
# Strong database password
POSTGRES_PASSWORD=your_strong_password_here

# Generate with: openssl rand -hex 32
SECRET_KEY=<64-char hex string>

# Generate with: openssl rand -hex 32
ENCRYPTION_KEY=<64-char hex string>
```

**2. Start the stack**

```bash
docker compose up -d
```

**3. Apply migrations and seed**

```bash
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed.seed
```

**4. Access the application**

Open [http://localhost](http://localhost) in your browser.

Default credentials:
- **Email:** `admin@ircc.local`
- **Password:** `ChangeMe123!`

> Change the admin password immediately after first login.

## Development

The dev compose file mounts source directories for hot reload:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

- Frontend hot reload at [http://localhost](http://localhost) (Next.js Turbopack)
- Backend auto-reload via Uvicorn
- PostgreSQL exposed on `localhost:5432`
- Redis exposed on `localhost:6379`

## API Documentation

With the stack running:

- **Swagger UI:** [http://localhost/docs](http://localhost/docs)
- **ReDoc:** [http://localhost/redoc](http://localhost/redoc)
- **Built-in viewer:** [http://localhost/api-docs](http://localhost/api-docs)

## External API

All `/api/v1/` routes are authenticated via API key. Create keys under **Admin → API Keys**.

```
Authorization: Bearer ircc_<key>
```

Available scopes: `incidents:read` `incidents:write` `documents:read` `tasks:read` `tasks:write` `audit:read` `comms:read`

## Authentication

| Method | Configuration |
|---|---|
| Local (username + password) | Enabled by default, bcrypt hashed |
| TOTP MFA | Per-user, QR code enrollment |
| SAML 2.0 | Configure under Admin → SSO |
| OIDC | Configure under Admin → SSO |

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `POSTGRES_PASSWORD` | Yes | PostgreSQL password |
| `SECRET_KEY` | Yes | JWT signing key (64-char hex) |
| `ENCRYPTION_KEY` | Yes | AES-256-GCM key for SSO configs and AI provider keys (64-char hex) |
| `SMTP_HOST` | No | SMTP host for email notifications |
| `SMTP_PORT` | No | SMTP port (default: 587) |
| `SMTP_USER` | No | SMTP username |
| `SMTP_PASSWORD` | No | SMTP password |
| `SMTP_FROM` | No | From address for notifications |
| `S3_ENDPOINT` | No | S3-compatible storage endpoint (default: local volume) |
| `S3_ACCESS_KEY` | No | S3 access key |
| `S3_SECRET_KEY` | No | S3 secret key |
| `S3_BUCKET` | No | S3 bucket name (default: `ircc-uploads`) |

## Project Structure

```
ircommandcenter/
├── backend/
│   ├── app/
│   │   ├── auth/          # JWT, SAML, OIDC, TOTP, encryption
│   │   ├── middleware/    # Audit logging, auth
│   │   ├── models/        # SQLAlchemy ORM models
│   │   ├── routers/       # FastAPI route handlers
│   │   ├── schemas/       # Pydantic request/response schemas
│   │   └── seed/          # Database seed data
│   └── alembic/           # Database migrations
├── frontend/
│   └── src/
│       ├── app/           # Next.js App Router pages
│       ├── components/    # Reusable UI components
│       ├── hooks/         # Custom React hooks
│       └── lib/           # API client and utilities
└── nginx/
    └── nginx.conf         # Reverse proxy config
```

## License

Proprietary — all rights reserved.

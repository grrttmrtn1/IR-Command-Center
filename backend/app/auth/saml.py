"""
SAML 2.0 integration via python3-saml.

Usage pattern:
  1. GET /api/auth/saml/init?config_id=<id>  — redirect to IdP SSO URL
  2. POST /api/auth/saml/callback             — process IdP assertion, return JWT
  3. GET /api/auth/saml/metadata              — return SP XML metadata
"""
from __future__ import annotations

import json
from typing import Any

from app.auth.encryption import decrypt
from app.models.user import SSOConfig


def build_saml_settings(sp_base_url: str, config: SSOConfig) -> dict[str, Any]:
    raw = json.loads(decrypt(config.config_encrypted))
    return {
        "strict": True,
        "debug": False,
        "sp": {
            "entityId": f"{sp_base_url}/api/auth/saml/metadata",
            "assertionConsumerService": {
                "url": f"{sp_base_url}/api/auth/saml/callback",
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST",
            },
            "NameIDFormat": "urn:oasis:names:tc:SAML:1.1:nameid-format:emailAddress",
        },
        "idp": {
            "entityId": raw.get("idp_entity_id", ""),
            "singleSignOnService": {
                "url": raw.get("idp_sso_url", ""),
                "binding": "urn:oasis:names:tc:SAML:2.0:bindings:HTTP-Redirect",
            },
            "x509cert": raw.get("idp_certificate", "").replace("-----BEGIN CERTIFICATE-----", "").replace("-----END CERTIFICATE-----", "").strip(),
        },
    }


def get_saml_auth(sp_base_url: str, config: SSOConfig, request_data: dict[str, Any]):
    """Return an initialized OneLogin_Saml2_Auth instance."""
    try:
        from onelogin.saml2.auth import OneLogin_Saml2_Auth  # type: ignore
    except ImportError as e:
        raise ImportError("python3-saml is not installed") from e

    settings = build_saml_settings(sp_base_url, config)
    return OneLogin_Saml2_Auth(request_data, settings)


def prepare_saml_request(request) -> dict[str, Any]:
    """Convert a FastAPI/Starlette Request into the dict python3-saml expects."""
    url = str(request.url)
    https = url.startswith("https")
    return {
        "https": "on" if https else "off",
        "http_host": request.headers.get("host", "localhost"),
        "server_port": request.url.port or (443 if https else 80),
        "script_name": request.url.path,
        "get_data": dict(request.query_params),
        "post_data": {},
    }

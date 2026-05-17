"""
OIDC integration via authlib.

Usage pattern:
  1. GET /api/auth/oidc/init?config_id=<id>  — redirect to IdP authorization endpoint
  2. GET /api/auth/oidc/callback              — exchange code, verify id_token, return JWT
"""
from __future__ import annotations

import json
from typing import Any

import httpx

from app.auth.encryption import decrypt
from app.models.user import SSOConfig


def get_oidc_config(config: SSOConfig) -> dict[str, Any]:
    return json.loads(decrypt(config.config_encrypted))


async def discover_oidc_endpoints(discovery_url: str) -> dict[str, Any]:
    """Fetch OIDC discovery document."""
    async with httpx.AsyncClient() as client:
        r = await client.get(discovery_url, timeout=10)
        r.raise_for_status()
        return r.json()


async def exchange_code(
    code: str,
    redirect_uri: str,
    config: SSOConfig,
) -> dict[str, Any]:
    """Exchange authorization code for tokens."""
    cfg = get_oidc_config(config)
    discovery = await discover_oidc_endpoints(cfg["discovery_url"])
    token_endpoint: str = discovery["token_endpoint"]

    async with httpx.AsyncClient() as client:
        r = await client.post(
            token_endpoint,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": redirect_uri,
                "client_id": cfg["client_id"],
                "client_secret": cfg["client_secret"],
            },
            timeout=15,
        )
        r.raise_for_status()
        return r.json()


async def get_userinfo(access_token: str, config: SSOConfig) -> dict[str, Any]:
    """Fetch user info from the OIDC userinfo endpoint."""
    cfg = get_oidc_config(config)
    discovery = await discover_oidc_endpoints(cfg["discovery_url"])
    userinfo_endpoint: str = discovery["userinfo_endpoint"]

    async with httpx.AsyncClient() as client:
        r = await client.get(
            userinfo_endpoint,
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=10,
        )
        r.raise_for_status()
        return r.json()


def build_authorization_url(config: SSOConfig, redirect_uri: str, state: str, discovery: dict[str, Any]) -> str:
    cfg = get_oidc_config(config)
    from urllib.parse import urlencode
    params = {
        "response_type": "code",
        "client_id": cfg["client_id"],
        "redirect_uri": redirect_uri,
        "scope": "openid email profile",
        "state": state,
    }
    return f"{discovery['authorization_endpoint']}?{urlencode(params)}"

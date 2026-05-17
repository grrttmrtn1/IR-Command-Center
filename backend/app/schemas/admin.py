from datetime import datetime
from pydantic import BaseModel
from app.models.user import UserRole


class UserCreate(BaseModel):
    email: str
    name: str | None = None
    password: str
    role: UserRole = UserRole.ANALYST


class UserAdminUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class ApiKeyCreate(BaseModel):
    name: str
    scopes: list[str]
    expires_at: datetime | None = None


class ApiKeyResponse(BaseModel):
    id: str
    name: str
    key_prefix: str
    scopes: list[str]
    last_used_at: datetime | None
    expires_at: datetime | None
    is_active: bool
    created_at: datetime

    @classmethod
    def from_orm_model(cls, obj):
        d = {
            "id": obj.id,
            "name": obj.name,
            "key_prefix": obj.key_prefix,
            "scopes": [s for s in (obj.scopes or "").split(",") if s],
            "last_used_at": obj.last_used_at,
            "expires_at": obj.expires_at,
            "is_active": obj.is_active,
            "created_at": obj.created_at,
        }
        return cls(**d)

    class Config:
        from_attributes = True


class ApiKeyCreatedResponse(ApiKeyResponse):
    plaintext_key: str


class SSOConfigCreate(BaseModel):
    type: str
    name: str
    is_active: bool = True
    # OIDC fields
    discovery_url: str | None = None
    client_id: str | None = None
    client_secret: str | None = None
    # SAML fields
    idp_entity_id: str | None = None
    idp_sso_url: str | None = None
    idp_certificate: str | None = None

    def to_config_dict(self) -> dict:
        if self.type == "OIDC":
            return {k: v for k, v in {
                "discovery_url": self.discovery_url,
                "client_id": self.client_id,
                "client_secret": self.client_secret,
            }.items() if v}
        return {k: v for k, v in {
            "idp_entity_id": self.idp_entity_id,
            "idp_sso_url": self.idp_sso_url,
            "idp_certificate": self.idp_certificate,
        }.items() if v}


class SSOConfigResponse(BaseModel):
    id: str
    type: str
    name: str
    is_active: bool
    created_at: datetime

    class Config:
        from_attributes = True

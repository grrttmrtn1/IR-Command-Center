from datetime import datetime
from pydantic import BaseModel


class OrgKnowledgeUpdate(BaseModel):
    org_name: str | None = None
    industry: str | None = None
    size: str | None = None
    critical_systems: list[str] | None = None
    regulatory_obligations: list[str] | None = None
    comm_voice: str | None = None
    comm_guidelines: str | None = None
    key_contacts: dict | None = None
    insurance_info: dict | None = None
    legal_counsel: dict | None = None


class OrgKnowledgeResponse(BaseModel):
    id: str
    org_name: str | None
    industry: str | None
    size: str | None
    critical_systems: list[str] | None
    regulatory_obligations: list[str] | None
    comm_voice: str | None
    comm_guidelines: str | None
    key_contacts: dict | None
    insurance_info: dict | None
    legal_counsel: dict | None

    class Config:
        from_attributes = True


class AIProviderConfig(BaseModel):
    api_key: str | None = None
    model: str | None = None
    endpoint: str | None = None
    deployment: str | None = None
    api_version: str | None = None


class AIConfigUpdate(BaseModel):
    default_provider: str | None = None
    providers: dict[str, AIProviderConfig] | None = None


class AIConfigResponse(BaseModel):
    default_provider: str
    providers: dict[str, dict]


class ContactCreate(BaseModel):
    name: str
    role: str | None = None
    email: str | None = None
    phone: str | None = None
    organization: str | None = None
    type: str = "INTERNAL"


class ContactResponse(BaseModel):
    id: str
    name: str
    role: str | None
    email: str | None
    phone: str | None
    organization: str | None
    type: str
    created_at: datetime

    class Config:
        from_attributes = True

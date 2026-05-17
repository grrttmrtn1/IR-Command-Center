from app.services.ai.base import AIProvider, AIMessage, AIResponse
from app.services.ai.anthropic_provider import AnthropicProvider
from app.services.ai.openai_provider import OpenAIProvider
from app.services.ai.azure_openai_provider import AzureOpenAIProvider
from app.services.ai.gemini_provider import GeminiProvider


def get_provider(config: dict, provider_name: str | None = None) -> AIProvider:
    """Build an AI provider from the stored (decrypted) config dict."""
    name = provider_name or config.get("default_provider", "anthropic")
    providers = config.get("providers", {})
    p = providers.get(name, {})

    if name == "anthropic":
        return AnthropicProvider(api_key=p["api_key"], model=p.get("model", "claude-sonnet-4-6"))
    if name == "openai":
        return OpenAIProvider(api_key=p["api_key"], model=p.get("model", "gpt-4o"))
    if name == "azure_openai":
        return AzureOpenAIProvider(
            endpoint=p["endpoint"],
            api_key=p["api_key"],
            deployment=p["deployment"],
            api_version=p.get("api_version", "2024-02-01"),
        )
    if name == "gemini":
        return GeminiProvider(api_key=p["api_key"], model=p.get("model", "gemini-1.5-pro"))

    raise ValueError(f"Unknown AI provider: {name}")

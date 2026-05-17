from openai import AsyncAzureOpenAI
from app.services.ai.base import AIProvider, AIMessage, AIResponse


class AzureOpenAIProvider(AIProvider):
    def __init__(self, endpoint: str, api_key: str, deployment: str, api_version: str = "2024-02-01"):
        self._client = AsyncAzureOpenAI(
            azure_endpoint=endpoint,
            api_key=api_key,
            api_version=api_version,
        )
        self._deployment = deployment

    @property
    def name(self) -> str:
        return "azure_openai"

    @property
    def default_model(self) -> str:
        return self._deployment

    async def generate(
        self,
        messages: list[AIMessage],
        system: str | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AIResponse:
        oai_messages = []
        if system:
            oai_messages.append({"role": "system", "content": system})
        for m in messages:
            oai_messages.append({"role": m.role, "content": m.content})

        response = await self._client.chat.completions.create(
            model=self._deployment,
            messages=oai_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        choice = response.choices[0]
        return AIResponse(
            content=choice.message.content or "",
            provider="azure_openai",
            model=self._deployment,
            input_tokens=response.usage.prompt_tokens if response.usage else 0,
            output_tokens=response.usage.completion_tokens if response.usage else 0,
        )

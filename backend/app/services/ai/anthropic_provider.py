import anthropic
from app.services.ai.base import AIProvider, AIMessage, AIResponse


class AnthropicProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "claude-sonnet-4-6"):
        self._client = anthropic.AsyncAnthropic(api_key=api_key)
        self._model = model

    @property
    def name(self) -> str:
        return "anthropic"

    @property
    def default_model(self) -> str:
        return "claude-sonnet-4-6"

    async def generate(
        self,
        messages: list[AIMessage],
        system: str | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AIResponse:
        anthropic_messages = [
            {"role": m.role, "content": m.content}
            for m in messages
            if m.role in ("user", "assistant")
        ]

        kwargs = dict(
            model=self._model,
            max_tokens=max_tokens,
            messages=anthropic_messages,
        )
        if system:
            kwargs["system"] = system

        response = await self._client.messages.create(**kwargs)

        return AIResponse(
            content=response.content[0].text,
            provider="anthropic",
            model=self._model,
            input_tokens=response.usage.input_tokens,
            output_tokens=response.usage.output_tokens,
        )

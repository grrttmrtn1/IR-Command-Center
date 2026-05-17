from openai import AsyncOpenAI
from app.services.ai.base import AIProvider, AIMessage, AIResponse


class OpenAIProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "gpt-4o"):
        self._client = AsyncOpenAI(api_key=api_key)
        self._model = model

    @property
    def name(self) -> str:
        return "openai"

    @property
    def default_model(self) -> str:
        return "gpt-4o"

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
            model=self._model,
            messages=oai_messages,
            max_tokens=max_tokens,
            temperature=temperature,
        )

        choice = response.choices[0]
        return AIResponse(
            content=choice.message.content or "",
            provider="openai",
            model=self._model,
            input_tokens=response.usage.prompt_tokens if response.usage else 0,
            output_tokens=response.usage.completion_tokens if response.usage else 0,
        )

import google.generativeai as genai
from app.services.ai.base import AIProvider, AIMessage, AIResponse


class GeminiProvider(AIProvider):
    def __init__(self, api_key: str, model: str = "gemini-1.5-pro"):
        genai.configure(api_key=api_key)
        self._model_name = model

    @property
    def name(self) -> str:
        return "gemini"

    @property
    def default_model(self) -> str:
        return "gemini-1.5-pro"

    async def generate(
        self,
        messages: list[AIMessage],
        system: str | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AIResponse:
        model = genai.GenerativeModel(
            model_name=self._model_name,
            system_instruction=system,
            generation_config=genai.GenerationConfig(
                max_output_tokens=max_tokens,
                temperature=temperature,
            ),
        )

        history = []
        last_user_msg = ""
        for m in messages:
            if m.role == "user":
                last_user_msg = m.content
                if history:
                    history.append({"role": "user", "parts": [m.content]})
            elif m.role == "assistant":
                history.append({"role": "model", "parts": [m.content]})

        chat = model.start_chat(history=history[:-1] if history else [])
        response = await chat.send_message_async(last_user_msg or messages[-1].content)

        return AIResponse(
            content=response.text,
            provider="gemini",
            model=self._model_name,
        )

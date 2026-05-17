from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class AIMessage:
    role: str  # "user" | "assistant" | "system"
    content: str


@dataclass
class AIResponse:
    content: str
    provider: str
    model: str
    input_tokens: int = 0
    output_tokens: int = 0


class AIProvider(ABC):
    @abstractmethod
    async def generate(
        self,
        messages: list[AIMessage],
        system: str | None = None,
        max_tokens: int = 2048,
        temperature: float = 0.7,
    ) -> AIResponse:
        pass

    @property
    @abstractmethod
    def name(self) -> str:
        pass

    @property
    @abstractmethod
    def default_model(self) -> str:
        pass

from collections.abc import Sequence
from typing import Literal

from pydantic import BaseModel

LanguageModelType = Literal["core", "editor", "reasoner", "router"]


class LanguageModel(BaseModel):
    """Identifies an LLM."""

    name: str
    """The name of the language model (used for the API)."""

    display_name: str
    """The display name of the language model (human-friendly)."""

    provider: str
    """The provider of the language model."""

    type: Sequence[LanguageModelType]
    """The type of language model (core or editor)."""

    is_recommended: bool = False
    is_custom: bool = False

    max_tokens: int = 8_192

    @property
    def id(self) -> str:
        if self.provider == "" and self.name == "":
            return ""
        prefix = "custom" if self.is_custom else "builtin"
        return f"{prefix}::{self.provider}::{self.name}"


class ProviderApiKeyConfig(BaseModel):
    env_var_name: str
    setup_url: str | None = None
    setup_text: str = "Create an API key at"


class ProxyConfig(BaseModel):
    language_model_prefix: str = ""


class LanguageModelProvider(BaseModel):
    id: str
    display_name: str
    api_key_config: ProviderApiKeyConfig | None = None
    proxy_config: ProxyConfig | None = None
    base_url: str | None = None
    is_custom: bool = False

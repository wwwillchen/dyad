import functools
import os
from collections.abc import Callable, Generator, Iterable
from typing import Any, Protocol, TypeVar, cast

from pydantic import BaseModel

from dyad.chat import LanguageModelRequest
from dyad.language_model import LanguageModel
from dyad.language_model.language_model import (
    LanguageModelProvider,
    ProviderApiKeyConfig,
)
from dyad.logging.logging import logger
from dyad.public.chat_message import (
    CompletionMetadataChunk,
    ErrorChunk,
    LanguageModelChunk,
    LanguageModelFinishReason,
    TextChunk,
)
from dyad.settings.user_settings import get_user_settings


def create_chat_handler(
    *,
    base_url: str | None = None,
    provider: str = "openai",
    is_prediction_supported: bool = False,
    model_prefix: str = "",
) -> "LanguageModelClient":
    class ChatLanguageModelHandler:
        def get_stream_options(self):
            from openai import NotGiven
            from openai.types.chat import (
                ChatCompletionStreamOptionsParam,
            )

            # See: https://github.com/BerriAI/litellm/issues/8710
            stream_options: NotGiven | ChatCompletionStreamOptionsParam = (
                NotGiven()
                if model_prefix == "groq/"
                else {"include_usage": True}
            )
            return stream_options

        def stream_structured_output(
            self, request: LanguageModelRequest[BaseModelType]
        ) -> Generator[BaseModelType, None, None]:
            # Lazily load to speed startup
            import instructor
            from openai import NotGiven, OpenAI

            if request.output_type is None:
                raise ValueError(
                    "output_type should be set for stream_structured_output"
                )
            language_model = get_language_model(request.language_model_id)
            api_key = get_provider_api_key(provider)
            if not api_key:
                raise ValueError(f"No API key found for provider {provider}")
            client = OpenAI(base_url=base_url, api_key=api_key)
            client = instructor.from_openai(client)
            try:
                stream = client.chat.completions.create_partial(
                    response_model=request.output_type,
                    prediction=NotGiven(),
                    model=model_prefix + language_model.name,
                    messages=(
                        [
                            {
                                "role": "system",
                                "content": request.system_prompt,
                            }
                        ]
                        if request.system_prompt
                        else []
                    )
                    + [
                        {
                            "role": message.role,
                            "content": message.to_language_model_text(),
                        }  # type: ignore
                        for message in request.history
                    ]
                    + [{"role": "user", "content": request.input.text}],
                    stream=True,
                    # See: https://github.com/BerriAI/litellm/issues/8710
                    stream_options=self.get_stream_options(),
                )
                yield from stream  # type: ignore
            except Exception as e:
                logger().exception(
                    "Error using %s's %s model: %s", provider, language_model, e
                )
                raise ValueError(
                    f"Error using {provider}'s {language_model.name} model {e!s}"
                ) from e

        def stream_chunks(
            self, request: LanguageModelRequest
        ) -> Generator[LanguageModelChunk, None, None]:
            from openai import NotGiven, OpenAI
            from openai.types.chat import ChatCompletionMessageParam

            language_model = get_language_model(request.language_model_id)
            api_key = get_provider_api_key(provider)
            if not api_key:
                raise ValueError(f"No API key found for provider {provider}")
            client = OpenAI(base_url=base_url, api_key=api_key)
            if request.output_type:
                raise ValueError(
                    "output_type should only be set for stream_structured_output"
                )
            prediction = request.prediction if is_prediction_supported else None
            if prediction:
                logger().debug(
                    "Using speculative decoding with prediction: %s", prediction
                )
            try:
                stream = client.chat.completions.create(
                    prediction={"type": "content", "content": prediction}
                    if prediction
                    else NotGiven(),
                    model=model_prefix + language_model.name,
                    max_completion_tokens=language_model.max_tokens,
                    messages=cast(
                        Iterable[ChatCompletionMessageParam],
                        (
                            [
                                {
                                    "role": "system",
                                    "content": request.system_prompt,
                                }
                            ]
                            if request.system_prompt
                            else []
                        )
                        + [
                            {
                                "role": message.role,
                                "content": message.to_language_model_text(),
                            }
                            for message in request.history
                        ]
                        + [{"role": "user", "content": request.input.text}],
                    ),
                    stream=True,
                    stream_options=self.get_stream_options(),
                )
                last_chunk = None
                last_choice = None
                for chunk in stream:
                    last_chunk = chunk
                    if not chunk.choices:
                        continue
                    content = chunk.choices[0].delta.content
                    last_choice = chunk.choices[0]

                    yield TextChunk(text=content or "")

                finish_reason = LanguageModelFinishReason.OTHER
                if last_choice is not None:
                    if last_choice.finish_reason == "stop":
                        finish_reason = LanguageModelFinishReason.STOP
                    elif last_choice.finish_reason == "max_tokens":
                        finish_reason = LanguageModelFinishReason.MAX_TOKENS
                        yield ErrorChunk(
                            message="Max tokens reached. Output may be truncated. Please try with another model."
                        )

                if last_chunk is None or last_chunk.usage is None:
                    yield CompletionMetadataChunk(
                        finish_reason=finish_reason,
                    )
                    return
                logger().info("Token usage: %s", last_chunk.usage)
                yield CompletionMetadataChunk(
                    input_tokens_count=last_chunk.usage.prompt_tokens,
                    output_tokens_count=last_chunk.usage.completion_tokens,
                    finish_reason=finish_reason,
                )
            except Exception as e:
                logger().exception(
                    "Error using %s's %s model", provider, language_model
                )
                yield ErrorChunk(
                    message=f"Error using {provider}'s {language_model.name} model: {e!s}"
                )

    return ChatLanguageModelHandler()


def safe_int(maybe_int: Any) -> int | None:
    try:
        return int(maybe_int)
    except (ValueError, TypeError):
        return None


BaseModelType = TypeVar("BaseModelType", bound=BaseModel)


class LanguageModelClient(Protocol):
    def stream_chunks(
        self, request: LanguageModelRequest
    ) -> Generator[LanguageModelChunk, None, None]:
        raise NotImplementedError()

    def stream_structured_output(
        self, request: LanguageModelRequest[BaseModelType]
    ) -> Generator[BaseModelType, None, None]:
        raise NotImplementedError()


_handlers: dict[str, LanguageModelClient] = {}
_proxy_handlers: dict[str, LanguageModelClient] = {}
_language_models: dict[str, LanguageModel] = {}


_providers: dict[str, LanguageModelProvider] = {}


def register_language_model_provider(provider: LanguageModelProvider):
    _providers[provider.id] = provider


def get_language_model_provider(id: str) -> LanguageModelProvider:
    for provider in get_language_model_providers():
        if provider.id == id:
            return provider
    raise ValueError(f"No provider found for {id}")


def get_language_model_providers() -> list[LanguageModelProvider]:
    return (
        list(_providers.values())
        + get_user_settings().custom_language_model_providers
    )


@functools.lru_cache
def is_ollama_setup() -> bool:
    # Check if Ollama is running by attempting to connect to the default host
    import requests

    try:
        host = "http://localhost:11434"
        requests.get(f"{host}/api/tags")
        return True
    except requests.RequestException:
        return False


def is_provider_setup(id: str) -> bool:
    if id == "ollama":
        return is_ollama_setup()
    if should_use_llm_proxy() and get_language_model_provider(id).proxy_config:
        return True
    return bool(get_provider_api_key(id))


def get_provider_api_key(provider_id: str) -> str:
    if provider_id == "ollama":
        # This is hardcoded because openai API requires an API key
        # but ollama doesn't need it.
        return "ollama"
    user_settings = get_user_settings()
    api_key = user_settings.provider_id_to_api_key.get(provider_id)
    if api_key:
        return api_key
    provider = get_language_model_provider(provider_id)
    if provider.api_key_config is None:
        raise ValueError(f"No API key required for provider {provider_id}")
    env_var_name = provider.api_key_config.env_var_name
    return os.environ.get(env_var_name, "")


def register_language_model_client(
    model: LanguageModel, model_provider: LanguageModelClient
):
    _handlers[model.id] = model_provider
    proxy_config = get_language_model_provider(model.provider).proxy_config
    if proxy_config:
        _proxy_handlers[model.id] = create_chat_handler(
            base_url=os.getenv(
                "LLM_PROXY_BASE_URL", "https://llmproxy.dyad.sh"
            ),
            provider="dyad",
            model_prefix=proxy_config.language_model_prefix,
        )
    _language_models[model.id] = model


def is_model_supported_by_proxy(model_id: str) -> bool:
    return model_id in _proxy_handlers


def should_use_llm_proxy() -> bool:
    return not get_user_settings().disable_llm_proxy and bool(
        get_provider_api_key("dyad")
    )


def _find_model_by_provider_and_name(
    provider: str, display_name: str
) -> LanguageModel | None:
    return next(
        (
            model
            for model in get_language_models()
            if model.provider == provider and model.display_name == display_name
        ),
        None,
    )


def create_auto_language_model_client(
    provider_models: list[tuple[str, str]],
) -> LanguageModelClient:
    class AutoLanguageModelClient:
        def resolve_auto_model(self) -> LanguageModel | None:
            return find_first_supported_model(provider_models)

        def stream_chunks(
            self, request: LanguageModelRequest
        ) -> Generator[LanguageModelChunk, None, None]:
            handler = use_provider_models(request, provider_models)
            if handler is not None:
                yield from handler.stream_chunks(request)
                return
            yield TextChunk(text="Please configure a language model provider.")

        def stream_structured_output(
            self, request: LanguageModelRequest[BaseModelType]
        ) -> Generator[BaseModelType, None, None]:
            handler = use_provider_models(request, provider_models)
            if handler is not None:
                yield from handler.stream_structured_output(request)
                return
            raise NotImplementedError(
                "Please configure a language model provider."
            )

    return AutoLanguageModelClient()


core_auto_language_model_client = create_auto_language_model_client(
    [
        ("anthropic", "Claude Sonnet 3.5"),
        ("openai", "GPT 4o"),
        ("google-genai", "Gemini 1.5 Pro"),
    ]
)

editor_auto_language_model_client = create_auto_language_model_client(
    [
        ("groq", "Llama 3.3 70B (Groq)"),
        ("google-genai", "Gemini 1.5 Flash"),
        ("openai", "GPT 4o mini"),
    ]
)

reasoner_auto_language_model_client = create_auto_language_model_client(
    [
        ("google-genai", "Gemini 2.0 Flash Thinking (Experimental)"),
        ("anthropic", "Claude Sonnet 3.5"),
        ("openai", "GPT 4o"),
    ]
)

router_auto_language_model_client = create_auto_language_model_client(
    [
        ("google-genai", "Gemini 2.0 Flash (Experimental)"),
        ("anthropic", "Claude Sonnet 3.5"),
        ("openai", "GPT 4o"),
    ]
)


def find_first_supported_model(
    provider_models: list[tuple[str, str]],
) -> LanguageModel | None:
    for provider, model_name in provider_models:
        if is_provider_setup(provider):
            model = _find_model_by_provider_and_name(provider, model_name)
            if model:
                return model
    return None


def use_provider_models(
    request: LanguageModelRequest, provider_models: list[tuple[str, str]]
) -> LanguageModelClient | None:
    first_supported_model = find_first_supported_model(provider_models)
    if first_supported_model:
        request.language_model_id = first_supported_model.id
        return get_language_model_client(first_supported_model.id)
    return None


DEFAULT_CORE_LANGUAGE_MODEL = LanguageModel(
    provider="dyad",
    name="auto-core",
    display_name="Auto",
    type=["core"],
)

DEFAULT_EDITOR_LANGUAGE_MODEL = LanguageModel(
    provider="dyad",
    name="auto-editor",
    display_name="Auto",
    type=["editor"],
)

DEFAULT_REASONER_LANGUAGE_MODEL = LanguageModel(
    provider="dyad",
    name="auto-reasoner",
    display_name="Auto",
    type=["reasoner"],
)

DEFAULT_ROUTER_LANGUAGE_MODEL = LanguageModel(
    provider="dyad",
    name="auto-router",
    display_name="Auto",
    type=["router"],
)

register_language_model_provider(
    LanguageModelProvider(
        id="dyad",
        display_name="Dyad",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="DYAD_API_KEY",
            setup_url="https://academy.dyad.sh/settings",
            setup_text="Subscribe to Dyad Pro",
        ),
    )
)


class WrapperLanguageModelHandler:
    def __init__(
        self,
        chunks_handler: Callable[
            [LanguageModelRequest], Generator[LanguageModelChunk, None, None]
        ],
    ):
        self.handler = chunks_handler

    def stream_chunks(
        self, request: LanguageModelRequest
    ) -> Generator[LanguageModelChunk, None, None]:
        yield from self.handler(request)

    def stream_structured_output(
        self, request: LanguageModelRequest
    ) -> Generator[BaseModel, None, None]:
        raise NotImplementedError("stream_structured_output not implemented")


register_language_model_client(
    DEFAULT_CORE_LANGUAGE_MODEL,
    core_auto_language_model_client,
)

register_language_model_client(
    DEFAULT_EDITOR_LANGUAGE_MODEL,
    editor_auto_language_model_client,
)

register_language_model_client(
    DEFAULT_REASONER_LANGUAGE_MODEL,
    reasoner_auto_language_model_client,
)

register_language_model_client(
    DEFAULT_ROUTER_LANGUAGE_MODEL,
    router_auto_language_model_client,
)


def get_language_model_client(model_id: str) -> LanguageModelClient:
    if should_use_llm_proxy() and model_id in _proxy_handlers:
        logger().info("Using proxy provider for model %s", model_id)
        return _proxy_handlers[model_id]
    if model_id in _handlers:
        return _handlers[model_id]
    for model in get_language_models():
        if model.id == model_id:
            return create_chat_handler(
                base_url=get_language_model_provider(model.provider).base_url,
                provider=model.provider,
            )
    raise ValueError(f"No handler found for model {model_id}")


def get_language_models() -> list[LanguageModel]:
    return (
        list(_language_models.values())
        + get_user_settings().custom_language_models
    )


def get_core_language_model() -> LanguageModel:
    return get_language_model(
        id=get_user_settings().core_language_model_id,
        default=DEFAULT_CORE_LANGUAGE_MODEL,
    )


def get_editor_language_model() -> LanguageModel:
    return get_language_model(
        id=get_user_settings().editor_language_model_id,
        default=DEFAULT_EDITOR_LANGUAGE_MODEL,
    )


def get_router_language_model() -> LanguageModel:
    return get_language_model(
        id=get_user_settings().language_model_type_to_id["router"],
        default=DEFAULT_ROUTER_LANGUAGE_MODEL,
    )


def get_reasoner_language_model() -> LanguageModel:
    return get_language_model(
        id=get_user_settings().language_model_type_to_id["reasoner"],
        default=DEFAULT_REASONER_LANGUAGE_MODEL,
    )


def get_language_model(
    id: str, default: LanguageModel = DEFAULT_CORE_LANGUAGE_MODEL
) -> LanguageModel:
    for model in get_language_models():
        if model.id == id:
            return model
    return default


def get_next_provider_model(model_id: str) -> LanguageModel | None:
    """
    Returns the ID of the next available model from the provided list that doesn't match the current model ID.

    Args:
        model_id: The ID of the current model
        provider_models: List of tuples containing (provider, model_name) pairs to check against

    Returns:
        str: The ID of the next available model, or model_id if no alternative is found
    """
    reasoner = get_reasoner_language_model()
    provider_models = [
        (reasoner.provider, reasoner.display_name),
        ("anthropic", "Claude Sonnet 3.5"),
        ("deepseek", "DeepSeek"),
        ("openai", "GPT 4o"),
        ("google-genai", "Gemini 1.5 Pro"),
    ]

    for provider, model_name in provider_models:
        if is_provider_setup(provider):
            model = _find_model_by_provider_and_name(provider, model_name)
            if model and model.id != model_id:
                return model

    return None

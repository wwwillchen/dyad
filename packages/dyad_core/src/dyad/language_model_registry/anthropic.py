import os
from collections.abc import Generator

from dyad.chat import BaseModelType
from dyad.extension import (
    LanguageModelRequest,
    register_language_model_client,
)
from dyad.language_model import LanguageModel
from dyad.language_model.language_model import (
    LanguageModelProvider,
    ProviderApiKeyConfig,
    ProxyConfig,
)
from dyad.language_model.language_model_clients import (
    get_language_model,
    get_provider_api_key,
    register_language_model_provider,
)
from dyad.logging.logging import logger
from dyad.public.chat_message import (
    CompletionMetadataChunk,
    ErrorChunk,
    LanguageModelChunk,
    TextChunk,
)
from dyad.settings.user_settings import get_user_settings


class AnthropicLanguageModelHandler:
    def stream_chunks(
        self, request: LanguageModelRequest
    ) -> Generator[LanguageModelChunk, None, None]:
        from anthropic import Anthropic, NotGiven

        client = Anthropic(
            api_key=get_provider_api_key("anthropic"),
            base_url=os.getenv("ANTHROPIC_API_BASE_URL"),
        )
        history = [
            {
                "role": message.role,
                "content": [
                    {
                        "text": message.to_language_model_text(),
                        "type": "text",
                    }
                ],
            }
            for message in request.history
        ]

        # Mark the second-to-last user message as cache-control so it
        # can be read from cache, see:
        # https://docs.anthropic.com/en/docs/build-with-claude/prompt-caching#continuing-a-multi-turn-conversation
        if (
            len(history) >= 2
            and history[-2]["role"] == "user"
            and not get_user_settings().disable_anthropic_cache
        ):
            history[-2]["content"][0]["cache_control"] = {"type": "ephemeral"}

        # Convert messages to Anthropic format
        messages = [
            *history,
            {
                "role": "user",
                "content": [
                    {
                        "text": request.input.text,
                        "type": "text",
                        "cache_control": None
                        if get_user_settings().disable_anthropic_cache
                        else {"type": "ephemeral"},
                    }
                ],
            },
        ]
        language_model = get_language_model(request.language_model_id)
        try:
            with client.messages.stream(
                temperature=0,
                system=[
                    {
                        "text": request.system_prompt,
                        "type": "text",
                        "cache_control": (
                            None
                            if get_user_settings().disable_anthropic_cache
                            else {"type": "ephemeral"}
                        ),
                    }
                ]
                if request.system_prompt
                else NotGiven(),
                model=language_model.name,
                max_tokens=language_model.max_tokens,
                messages=messages,  # type: ignore
            ) as stream:
                for event in stream:
                    if event.type == "message_start":
                        logger().info(
                            "Anthropic message start: %s", event.message
                        )
                    # Handle delta (partial content) events
                    elif event.type == "content_block_delta":
                        if event.delta.type == "text_delta":
                            yield TextChunk(text=event.delta.text)
        except Exception as e:
            yield ErrorChunk(
                message=f"Error using Anthropic model: {language_model.name}\n\n---\n\n{e!s}"
            )
            return
        usage = stream.get_final_message().usage
        logger().info("Claude usage: %s", usage)
        yield CompletionMetadataChunk(
            input_tokens_count=usage.input_tokens
            + (usage.cache_creation_input_tokens or 0),
            cached_input_tokens_count=usage.cache_read_input_tokens or 0,
            output_tokens_count=usage.output_tokens,
        )

    def stream_structured_output(
        self, request: LanguageModelRequest[BaseModelType]
    ) -> Generator[BaseModelType, None, None]:
        raise NotImplementedError(
            "Structured output is not implemented yet for anthropic provider"
        )


register_language_model_provider(
    LanguageModelProvider(
        id="anthropic",
        display_name="Anthropic",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="ANTHROPIC_API_KEY",
            setup_url="https://console.anthropic.com/account/keys",
        ),
        proxy_config=ProxyConfig(language_model_prefix="anthropic/"),
    )
)

handler = AnthropicLanguageModelHandler()

# Update model names for Anthropic
register_language_model_client(
    LanguageModel(
        provider="anthropic",
        name="claude-3-7-sonnet-latest",
        display_name="Claude Sonnet 3.7",
        type=["core"],
        is_recommended=True,
    ),
    handler,
)

register_language_model_client(
    LanguageModel(
        provider="anthropic",
        name="claude-3-5-sonnet-latest",
        display_name="Claude Sonnet 3.5",
        type=["core"],
        is_recommended=True,
    ),
    handler,
)

register_language_model_client(
    LanguageModel(
        provider="anthropic",
        name="claude-3-5-haiku-latest",
        display_name="Claude Haiku 3.5",
        type=["core"],
    ),
    handler,
)

import json
from collections.abc import Generator
from dataclasses import dataclass

import requests

from dyad.language_model.language_model import (
    LanguageModelProvider,
    ProviderApiKeyConfig,
)
from dyad.language_model.language_model_clients import (
    get_provider_api_key,
    register_language_model_provider,
)


@dataclass
class ChunkOutput:
    content: str
    citations: list[str]


def chat_with_search(
    input: str,
) -> Generator[ChunkOutput, None, None]:
    url = "https://api.perplexity.ai/chat/completions"

    payload = {
        "model": "sonar",
        # TODO: Support history
        "messages": [{"content": input, "role": "user"}],
        "stream": True,
    }
    headers = {
        "Authorization": f"Bearer {get_provider_api_key('perplexity')}",
        "Content-Type": "application/json",
    }

    response = requests.request(
        "POST", url, json=payload, headers=headers, stream=True
    )

    for line in response.iter_lines():
        if line:
            # SSE format typically starts with "data: "
            line = line.decode("utf-8")
            if line.startswith("data: "):
                data = line[6:]  # Remove "data: " prefix
                try:
                    json_data = json.loads(data)
                    yield ChunkOutput(
                        content=json_data["choices"][0]["delta"]["content"],
                        citations=json_data["citations"],
                    )
                except json.JSONDecodeError:
                    continue


register_language_model_provider(
    LanguageModelProvider(
        id="perplexity",
        display_name="Perplexity",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="PERPLEXITY_API_KEY",
            setup_url="https://www.perplexity.ai/settings/api",
        ),
    )
)

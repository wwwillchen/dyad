import os
from abc import ABC, abstractmethod
from collections.abc import Iterator

# Import to make sure they are registered
from dyad import language_model_registry as language_model_registry
from dyad.language_model.language_model_clients import (
    get_language_model_provider,
    get_provider_api_key,
    should_use_llm_proxy,
)
from dyad.logging.logging import logger
from dyad.settings.user_settings import EmbeddingModelConfig, get_user_settings


class EmbeddingProvider(ABC):
    """Abstract base class for embedding providers."""

    provider_id: str

    @abstractmethod
    def generate_single_embedding(self, text: str) -> list[float]:
        """Generate embedding for a single string."""
        pass

    @abstractmethod
    def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Generate embeddings for a list of strings in batches."""
        pass


class OpenAIEmbeddingProvider(EmbeddingProvider):
    """OpenAI-specific implementation of the embedding provider."""

    def __repr(self) -> str:
        return f"OpenAIEmbeddingProvider(provider_id={self.provider_id}, base_url={self.base_url}, model_prefix={self.model_prefix})"

    def __init__(
        self,
        provider_id: str,
        base_url: str | None = None,
        model_prefix: str = "",
    ):
        """
        Initialize the OpenAI embedding provider.

        Args:
            model (str): OpenAI embedding model to use.
            batch_size (int): Number of texts to process in each batch.
            api_key (Optional[str]): OpenAI API key. If None, uses environment variable.
        """
        super().__init__()
        self.provider_id = provider_id
        self.batch_size = 100
        self.base_url = base_url
        self.model_prefix = model_prefix

    @property
    def client(self):
        from openai import OpenAI

        return OpenAI(
            api_key=get_provider_api_key(self.provider_id),
            base_url=self.base_url,
        )

    def generate_single_embedding(self, text: str) -> list[float]:
        if not text:
            raise ValueError("Input text is empty.")
        model_config = get_user_settings().get_embedding_model_config_or_throw()
        try:
            response = self.client.embeddings.create(
                encoding_format="float",
                model=self.model_prefix + model_config.embedding_model_name,
                input=[text],
            )
            return response.data[0].embedding
        except Exception as e:
            logger().error(f"Error generating embedding: {e}")
            return []

    def _batch_texts(self, texts: list[str]) -> Iterator[list[str]]:
        """
        Split texts into batches.

        Args:
            texts (List[str]): List of texts to batch.

        Yields:
            Iterator[List[str]]: Batches of texts.
        """
        for i in range(0, len(texts), self.batch_size):
            batch = texts[i : i + self.batch_size]
            yield batch

    def generate_embeddings(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            raise ValueError("Input list of texts is empty.")
        model_config = get_user_settings().get_embedding_model_config_or_throw()
        total_texts = len(texts)
        logger().info(
            f"Generating embeddings for {total_texts} texts in batches of {self.batch_size}"
        )

        all_embeddings: list[list[float]] = []
        batch_num = -1
        try:
            for batch_num, batch in enumerate(self._batch_texts(texts), 1):
                batch_size = len(batch)
                start_idx = (batch_num - 1) * self.batch_size
                end_idx = start_idx + batch_size

                logger().info(
                    f"Processing batch {batch_num}: texts {start_idx + 1}-{end_idx} "
                    f"({batch_size} texts)"
                )
                logger().debug(
                    "Using model: %s",
                    self.model_prefix + model_config.embedding_model_name,
                )
                response = self.client.embeddings.create(
                    model=self.model_prefix + model_config.embedding_model_name,
                    encoding_format="float",
                    input=batch,
                )
                batch_embeddings = [item.embedding for item in response.data]
                all_embeddings.extend(batch_embeddings)

                logger().info(
                    f"✓ Completed batch {batch_num} "
                    f"({end_idx}/{total_texts} texts processed)"
                )

            logger().info(
                f"✓ Completed all batches. Generated {len(all_embeddings)} embeddings."
            )
            return all_embeddings

        except Exception as e:
            logger().error(f"Error occurred during batch {batch_num}: {e}")
            return []


_registered_models: list[EmbeddingModelConfig] = []


def get_embedding_models(provider_id: str) -> list[EmbeddingModelConfig]:
    res = [
        model
        for model in _registered_models
        if model.provider_id == provider_id
    ]
    if len(res) == 0:
        raise ValueError(
            f"No embedding models found for provider {provider_id}"
        )
    return res


def register_embedding_models(models: list[EmbeddingModelConfig]):
    for model in models:
        _registered_models.append(model)


register_embedding_models(
    [
        EmbeddingModelConfig(
            embedding_model_name="text-embedding-3-small",
            embedding_dim=1536,  # use the default embedding dimension
            provider_id="openai",
        ),
        EmbeddingModelConfig(
            embedding_model_name="text-embedding-004",
            embedding_dim=768,  # max for this model
            provider_id="google-genai",
        ),
    ],
)

_providers: dict[str, EmbeddingProvider] = {}
_proxy_providers: dict[str, EmbeddingProvider] = {}


def register_embedding_provider(provider: EmbeddingProvider):
    if not provider.provider_id:
        raise ValueError("Provider ID is required")
    _providers[provider.provider_id] = provider
    proxy_config = get_language_model_provider(
        provider.provider_id
    ).proxy_config
    if proxy_config:
        _proxy_providers[provider.provider_id] = OpenAIEmbeddingProvider(
            base_url=os.getenv(
                "LLM_PROXY_BASE_URL", "https://llmproxy.dyad.sh"
            ),
            provider_id="dyad",
            model_prefix=proxy_config.language_model_prefix,
        )


def get_embedding_providers() -> list[EmbeddingProvider]:
    return list(_providers.values())


def get_embedding_provider(provider_id: str) -> EmbeddingProvider:
    if should_use_llm_proxy():
        return _proxy_providers[provider_id]
    if provider_id not in _providers:
        raise ValueError(f"Provider {provider_id} not found")
    return _providers[provider_id]


register_embedding_provider(
    provider=OpenAIEmbeddingProvider(provider_id="openai"),
)

register_embedding_provider(
    provider=OpenAIEmbeddingProvider(
        provider_id="google-genai",
        base_url=os.getenv(
            "GOOGLE_GENAI_OPENAI_API_BASE_URL",
            "https://generativelanguage.googleapis.com/v1beta/openai/",
        ),
    ),
)

import os

from dyad.extension import (
    register_language_model_client,
)
from dyad.language_model import LanguageModel
from dyad.language_model.language_model import (
    LanguageModelProvider,
    ProviderApiKeyConfig,
    ProxyConfig,
)
from dyad.language_model.language_model_clients import (
    create_chat_handler,
    register_language_model_provider,
)

# Make sure it's imported
from dyad.language_model_registry import anthropic as anthropic

register_language_model_provider(
    LanguageModelProvider(
        id="openai",
        display_name="OpenAI",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="OPENAI_API_KEY",
            setup_url="https://platform.openai.com/api-keys",
        ),
        proxy_config=ProxyConfig(),
    )
)


register_language_model_client(
    LanguageModel(
        provider="openai",
        name="chatgpt-4o-latest",
        display_name="GPT 4o",
        type=["core"],
    ),
    create_chat_handler(),
)
register_language_model_client(
    LanguageModel(
        provider="openai",
        name="o3-mini",
        display_name="o3 mini",
        type=["reasoner"],
    ),
    create_chat_handler(),
)
register_language_model_client(
    LanguageModel(
        provider="openai",
        name="gpt-4o-mini",
        display_name="GPT 4o mini",
        type=["editor"],
    ),
    create_chat_handler(is_prediction_supported=True),
)


register_language_model_provider(
    LanguageModelProvider(
        id="groq",
        display_name="Groq",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="GROQ_API_KEY",
            setup_url="https://console.groq.com/keys",
        ),
        proxy_config=ProxyConfig(language_model_prefix="groq/"),
    )
)

groq_handler = create_chat_handler(
    base_url="https://api.groq.com/openai/v1",
    provider="groq",
)

register_language_model_client(
    LanguageModel(
        provider="groq",
        name="llama-3.3-70b-specdec",
        display_name="Llama 3.3 70B (Groq SpecDec)",
        type=["editor"],
        is_recommended=True,
    ),
    groq_handler,
)

register_language_model_client(
    LanguageModel(
        provider="groq",
        name="llama-3.3-70b-versatile",
        display_name="Llama 3.3 70B (Groq)",
        type=["editor"],
        is_recommended=True,
    ),
    groq_handler,
)

register_language_model_client(
    LanguageModel(
        provider="groq",
        name="qwen-qwq-32b",
        display_name="Qwen QwQ 32B",
        type=["reasoner"],
    ),
    groq_handler,
)

register_language_model_client(
    LanguageModel(
        provider="groq",
        name="deepseek-r1-distill-llama-70b-specdec",
        display_name="DeepSeek R1 Distill Llama 70B SpecDec",
        type=["reasoner"],
    ),
    groq_handler,
)
register_language_model_provider(
    LanguageModelProvider(
        id="sambanova",
        display_name="SambaNova",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="SAMBANOVA_API_KEY",
            setup_url="https://cloud.sambanova.ai/apis",
        ),
    )
)


register_language_model_client(
    LanguageModel(
        provider="sambanova",
        name="Meta-Llama-3.3-70B-Instruct",
        display_name="Llama 3.3 70B (SambaNova)",
        type=["core", "editor"],
    ),
    create_chat_handler(
        base_url="https://api.sambanova.ai/v1",
        provider="sambanova",
    ),
)


register_language_model_provider(
    LanguageModelProvider(
        id="cerebras",
        display_name="Cerebras",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="CEREBRAS_API_KEY",
            setup_url="https://cloud.cerebras.ai/",
        ),
    )
)

register_language_model_client(
    LanguageModel(
        provider="cerebras",
        name="llama-3.3-70b",
        display_name="Llama 3.3 70B (Cerebras)",
        type=["editor"],
    ),
    create_chat_handler(
        base_url="https://api.cerebras.ai/v1",
        provider="cerebras",
    ),
)


register_language_model_provider(
    LanguageModelProvider(
        id="deepseek",
        display_name="DeepSeek",
        api_key_config=ProviderApiKeyConfig(
            env_var_name="DEEPSEEK_API_KEY",
            setup_url="https://platform.deepseek.com/api_keys",
        ),
    )
)

register_language_model_client(
    LanguageModel(
        provider="deepseek",
        name="deepseek-chat",
        display_name="DeepSeek V3",
        type=["core"],
    ),
    create_chat_handler(
        base_url="https://api.deepseek.com",
        provider="deepseek",
    ),
)

register_language_model_client(
    LanguageModel(
        provider="deepseek",
        name="deepseek-reasoner",
        display_name="DeepSeek R1",
        type=["reasoner"],
    ),
    create_chat_handler(
        base_url="https://api.deepseek.com",
        provider="deepseek",
    ),
)


register_language_model_provider(
    LanguageModelProvider(
        id="ollama",
        display_name="Ollama",
        base_url="http://localhost:11434",
    )
)

# Register some common Ollama models
ollama_models = [
    LanguageModel(
        provider="ollama",
        name="llama3.2",
        display_name="Llama 3.2 3b",
        type=["core"],
    ),
]

for model in ollama_models:
    register_language_model_client(
        model,
        create_chat_handler(
            base_url="http://localhost:11434/v1/", provider="ollama"
        ),
    )

gemini_handler = create_chat_handler(
    base_url=os.getenv(
        "GOOGLE_GENAI_OPENAI_API_BASE_URL",
        "https://generativelanguage.googleapis.com/v1beta/openai/",
    ),
    provider="google-genai",
)

register_language_model_provider(
    LanguageModelProvider(
        id="google-genai",
        display_name="Google Gemini",
        api_key_config=ProviderApiKeyConfig(
            setup_url="https://aistudio.google.com/",
            setup_text="Create an API key (generous free tier)",
            env_var_name="GEMINI_API_KEY",
        ),
        proxy_config=ProxyConfig(language_model_prefix="gemini/"),
    )
)
register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-2.0-flash-001",
        display_name="Gemini 2.0 Flash",
        type=["editor", "router"],
    ),
    gemini_handler,
)
register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-2.0-flash-001",
        display_name="Gemini 2.0 Flash",
        type=["editor", "router"],
    ),
    gemini_handler,
)
register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-1.5-flash",
        display_name="Gemini 1.5 Flash",
        type=["editor"],
    ),
    gemini_handler,
)
register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-1.5-flash-8b",
        display_name="Gemini 1.5 Flash 8B",
        type=["editor"],
    ),
    gemini_handler,
)
register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-1.5-pro",
        display_name="Gemini 1.5 Pro",
        type=["core"],
    ),
    gemini_handler,
)

register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-2.0-flash-thinking-exp-01-21",
        display_name="Gemini 2.0 Flash Thinking (Experimental)",
        type=["reasoner"],
    ),
    gemini_handler,
)
register_language_model_client(
    LanguageModel(
        provider="google-genai",
        name="gemini-2.0-pro-exp-02-05",
        display_name="Gemini 2.0 Pro (Experimental)",
        type=["core"],
    ),
    gemini_handler,
)

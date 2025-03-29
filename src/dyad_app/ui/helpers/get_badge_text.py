from dyad.language_model.language_model_clients import (
    get_language_model_provider,
)


def get_badge_text(provider_id: str) -> str | None:
    provider = get_language_model_provider(provider_id)
    if provider.id == "google-genai":
        return "Free"
    if provider.is_custom:
        return "Custom"
    if provider.id == "dyad":
        return "All-in-one"
    return None

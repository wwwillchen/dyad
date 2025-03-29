from dyad.language_model.language_model_clients import is_provider_setup
from dyad.settings.user_settings import get_user_settings


def is_dyad_pro_user() -> bool:
    return is_provider_setup("dyad")


def is_dyad_pro_enabled() -> bool:
    return is_dyad_pro_user() and not get_user_settings().disable_llm_proxy

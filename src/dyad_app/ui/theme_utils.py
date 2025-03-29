import mesop as me
from dyad.settings.user_settings import get_user_settings


def load_theme_mode_from_settings():
    me.set_theme_density(-1)
    settings = get_user_settings()
    me.set_theme_mode(settings.theme_mode)  # type: ignore

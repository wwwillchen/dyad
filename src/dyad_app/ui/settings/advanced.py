import mesop as me
from dyad.settings.user_settings import get_user_settings


def advanced_settings():
    me.slide_toggle(
        "Disable LLM Proxy (Dyad Pro)",
        checked=get_user_settings().disable_llm_proxy,
        on_change=on_change_use_llm_proxy,
    )
    me.slide_toggle(
        "Show dyad annotations",
        checked=get_user_settings().show_dyad_annotations,
        on_change=on_change_show_dyad_annotations,
    )
    me.slide_toggle(
        "Disable Anthropic cache",
        checked=get_user_settings().disable_anthropic_cache,
        on_change=on_change_disable_anthropic_cache,
    )
    me.slide_toggle(
        "All pad",
        checked=get_user_settings().pad_mode == "all",
        on_change=on_change_pad_mode,
    )


def on_change_use_llm_proxy(e: me.SlideToggleChangeEvent):
    settings = get_user_settings()
    settings.disable_llm_proxy = not settings.disable_llm_proxy
    settings.save()


def on_change_show_dyad_annotations(e: me.SlideToggleChangeEvent):
    settings = get_user_settings()
    settings.show_dyad_annotations = not settings.show_dyad_annotations
    settings.save()


def on_change_disable_anthropic_cache(e: me.SlideToggleChangeEvent):
    settings = get_user_settings()
    settings.disable_anthropic_cache = not settings.disable_anthropic_cache
    settings.save()


def on_change_pad_mode(e: me.SlideToggleChangeEvent):
    settings = get_user_settings()
    settings.pad_mode = "all" if settings.pad_mode == "learning" else "learning"
    settings.save()

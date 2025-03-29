from dataclasses import field

import mesop as me
import mesop.labs as mel
from dyad.language_model.language_model import (
    LanguageModelProvider,
    ProviderApiKeyConfig,
)
from dyad.language_model.language_model_clients import (
    get_language_model_providers,
)
from dyad.settings.user_settings import get_user_settings

from dyad_app.web_components.dialog import dialog


def create_default_provider():
    return LanguageModelProvider(
        id="",
        display_name="",
        api_key_config=ProviderApiKeyConfig(env_var_name=""),
        base_url="",
        is_custom=True,
    )


@me.stateclass
class AddProviderDialogState:
    dialog_open: bool = False
    provider: LanguageModelProvider = field(
        default_factory=create_default_provider
    )
    error_message: str | None = None


def add_provider_dialog():
    dialog_state = me.state(AddProviderDialogState)
    with dialog(
        open=dialog_state.dialog_open, on_close=on_close_add_provider_dialog
    ):
        with me.box(
            style=me.Style(
                width=400, display="block", padding=me.Padding.all(16)
            )
        ):
            with me.box(
                style=me.Style(
                    padding=me.Padding(bottom=12),
                    display="flex",
                    flex_direction="row",
                    justify_content="space-between",
                    align_items="center",
                )
            ):
                me.text(
                    "Add a new provider",
                    style=me.Style(font_size=24, font_weight=500),
                )

            me.text("Provider id (must be unique)")
            me.input(
                label="Provider id",
                value=dialog_state.provider.id,
                on_blur=lambda e: setattr(dialog_state.provider, "id", e.value),
                style=me.Style(width="100%"),
                required=True,
            )

            me.text("Provider name (human-readable)")
            me.input(
                label="Provider name",
                value=dialog_state.provider.display_name,
                on_blur=lambda e: setattr(
                    dialog_state.provider, "display_name", e.value
                ),
                style=me.Style(width="100%"),
                required=True,
            )
            me.text("Base URL")
            me.input(
                label="Base URL",
                value=dialog_state.provider.base_url or "",
                on_blur=lambda e: setattr(
                    dialog_state.provider, "base_url", e.value
                ),
                style=me.Style(width="100%"),
            )
            assert dialog_state.provider.api_key_config is not None
            me.text("API Key Environment variable")
            me.input(
                label="API Key Environment variable",
                value=dialog_state.provider.api_key_config.env_var_name,
                on_blur=lambda e: setattr(
                    dialog_state.provider.api_key_config,
                    "env_var_name",
                    e.value,
                ),
                style=me.Style(width="100%"),
                required=True,
            )

            if dialog_state.error_message:
                me.text(
                    dialog_state.error_message,
                    style=me.Style(color=me.theme_var("error")),
                )

            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    justify_content="end",
                    gap=6,
                    padding=me.Padding(top=12),
                )
            ):
                me.button(
                    "Cancel",
                    on_click=lambda e: on_close_add_provider_dialog(),
                )
                me.button(
                    "Add",
                    on_click=lambda e: on_add_provider(),
                )


def on_close_add_provider_dialog(e: mel.WebEvent | None = None):
    state = me.state(AddProviderDialogState)
    state.dialog_open = False
    state.provider = create_default_provider()


def on_add_provider(e: mel.WebEvent | None = None):
    state = me.state(AddProviderDialogState)
    assert state.provider.api_key_config is not None
    if (
        not state.provider.id
        or not state.provider.display_name
        or not state.provider.api_key_config.env_var_name
        or not state.provider.base_url
    ):
        state.error_message = "All fields are required"
        return
    if state.provider.id in [
        provider.id for provider in get_language_model_providers()
    ]:
        state.error_message = "Provider id must be unique"
        return

    state.dialog_open = False
    settings = get_user_settings()
    settings.custom_language_model_providers.append(state.provider)
    settings.save()
    state.provider = create_default_provider()


def open_add_provider_dialog():
    state = me.state(AddProviderDialogState)
    state.dialog_open = True

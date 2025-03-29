import os

import mesop as me
import mesop.labs as mel
from dyad.language_model.language_model_clients import (
    get_language_model_provider,
    is_provider_setup,
)
from dyad.settings.user_settings import get_user_settings
from pydantic import BaseModel

from dyad_app.web_components.dialog import dialog


class SelectedProviderState(BaseModel):
    provider: str | None = None


@me.stateclass
class DialogState:
    dialog_open: bool = False
    provider: str
    api_key: str
    # selected_provider_state: SelectedProviderState


def change_api_key_settings(e: me.InputBlurEvent):
    state = me.state(DialogState)
    user_settings = get_user_settings()
    user_settings.provider_id_to_api_key[state.provider] = e.value
    user_settings.save()


def provider_setup_dialog():
    dialog_state = me.state(DialogState)
    with dialog(open=dialog_state.dialog_open, on_close=on_close_dialog):
        if not dialog_state.provider:
            return
        with me.box(
            style=me.Style(
                display="block",
                padding=me.Padding.all(16),
            )
        ):
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="column",
                    min_width="min(80vw, 360px)",
                    gap=16,
                )
            ):
                with me.box(
                    style=me.Style(
                        display="flex",
                        flex_direction="row",
                        align_items="center",
                        justify_content="space-between",
                    )
                ):
                    me.text(
                        "Configure "
                        + get_language_model_provider(
                            dialog_state.provider
                        ).display_name,
                        style=me.Style(font_size=24, font_weight=500),
                    )

                api_key_config = get_language_model_provider(
                    dialog_state.provider
                ).api_key_config
                if dialog_state.provider == "ollama":
                    me.markdown("""
Read [ollama docs](https://github.com/ollama/ollama/tree/main/docs) to setup.
                                
Your ollama server must be running on `http://localhost:11434`.
                                """)
                elif api_key_config is None:
                    me.text("No API key configuration required")
                elif (
                    not is_provider_setup(dialog_state.provider)
                    and api_key_config.setup_url is not None
                ):
                    with me.box(style=me.Style(display="inline-flex", gap=16)):
                        me.text(
                            api_key_config.setup_text,
                            # style=me.Style(display="inline"),
                        )
                        me.link(
                            text="Setup",
                            url=api_key_config.setup_url,
                            open_in_new_tab=True,
                            style=me.Style(
                                color=me.theme_var("primary"),
                                text_decoration="none",
                                outline="none",
                            ),
                        )
                if api_key_config is not None:
                    with me.accordion():
                        with me.expansion_panel(
                            title="Settings", expanded=True
                        ):
                            me.text(
                                "Settings takes precedence over environmental variable"
                            )
                            me.box(style=me.Style(height=16))
                            me.input(
                                value=get_user_settings().provider_id_to_api_key.get(
                                    dialog_state.provider, ""
                                ),
                                on_blur=change_api_key_settings,
                                label="API key",
                                style=me.Style(width="100%"),
                                subscript_sizing="dynamic",
                            )
                        with me.expansion_panel(
                            title="Environmental variable",
                            expanded=True,
                        ):
                            env_var_name = api_key_config.env_var_name
                            me.text(
                                "You can view the environmental variable (but not edit)"
                            )
                            me.box(style=me.Style(height=16))
                            me.input(
                                value=os.getenv(env_var_name, "(not set)"),
                                label=env_var_name,
                                readonly=True,
                                style=me.Style(width="100%"),
                                subscript_sizing="dynamic",
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
                    "OK",
                    on_click=lambda e: on_close_dialog(),
                )
            with me.box(
                style=me.Style(
                    position="absolute",
                    top=8,
                    right=8,
                )
            ):
                with me.tooltip(
                    message="Delete provider",
                ):
                    with me.content_button(
                        type="icon",
                        on_click=on_delete_provider,
                    ):
                        me.icon("delete")


def on_delete_provider(e: me.ClickEvent):
    state = me.state(DialogState)
    get_user_settings().delete_custom_language_model_provider(
        state.provider
    ).save()
    state.provider = ""
    state.dialog_open = False


def open_provider_setup_dialog(*, provider: str):
    state = me.state(DialogState)
    state.provider = provider
    state.dialog_open = True


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False
    state.provider = ""

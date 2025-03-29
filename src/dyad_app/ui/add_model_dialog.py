from dataclasses import field

import mesop as me
import mesop.labs as mel
from dyad.language_model.language_model import (
    LanguageModel,
)
from dyad.language_model.language_model_clients import (
    get_language_model_providers,
)
from dyad.settings.user_settings import get_user_settings

from dyad_app.web_components.dialog import dialog


def create_default_model():
    return LanguageModel(
        name="",
        display_name="",
        provider="",
        # Not configurable, but it doens't really matter
        type=["core"],
        is_recommended=False,
        is_custom=True,
    )


@me.stateclass
class AddModelDialogState:
    dialog_open: bool = False
    model: LanguageModel = field(default_factory=create_default_model)
    error_message: str | None = None


def add_model_dialog():
    dialog_state = me.state(AddModelDialogState)
    with dialog(
        open=dialog_state.dialog_open, on_close=on_close_add_model_dialog
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
                    "Add a new model",
                    style=me.Style(font_size=24, font_weight=500),
                )

            me.text("Model name (API identifier)")
            me.input(
                label="Model name",
                value=dialog_state.model.name,
                on_blur=lambda e: setattr(dialog_state.model, "name", e.value),
                style=me.Style(width="100%"),
                required=True,
            )

            me.text("Display name (human-readable)")
            me.input(
                label="Display name",
                value=dialog_state.model.display_name,
                on_blur=lambda e: setattr(
                    dialog_state.model, "display_name", e.value
                ),
                style=me.Style(width="100%"),
                required=True,
            )

            me.text("Provider")
            providers = [
                provider.id for provider in get_language_model_providers()
            ]
            me.select(
                label="Provider",
                value=dialog_state.model.provider,
                options=[me.SelectOption(label=p, value=p) for p in providers],
                on_selection_change=lambda e: setattr(
                    dialog_state.model, "provider", e.value
                ),
                style=me.Style(width="100%"),
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
                    on_click=lambda e: on_close_add_model_dialog(),
                )
                me.button(
                    "Add",
                    on_click=lambda e: on_add_model(),
                )


def on_close_add_model_dialog(e: mel.WebEvent | None = None):
    state = me.state(AddModelDialogState)
    state.dialog_open = False
    state.model = create_default_model()


def on_add_model(e: mel.WebEvent | None = None):
    state = me.state(AddModelDialogState)
    if (
        not state.model.name
        or not state.model.display_name
        or not state.model.provider
    ):
        state.error_message = "Name, display name, and provider are required"
        return

    state.dialog_open = False
    settings = get_user_settings()
    settings.custom_language_models.append(state.model)
    settings.save()
    state.model = create_default_model()


def open_add_model_dialog():
    state = me.state(AddModelDialogState)
    state.dialog_open = True

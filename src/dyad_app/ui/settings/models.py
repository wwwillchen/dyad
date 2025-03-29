import functools

import mesop as me
from dyad.language_model.language_model import LanguageModel
from dyad.language_model.language_model_clients import (
    get_language_model_providers,
)
from dyad.settings.user_settings import get_user_settings
from dyad_app.ui.add_model_dialog import add_model_dialog, open_add_model_dialog
from dyad_app.ui.add_provider_dialog import (
    add_provider_dialog,
    open_add_provider_dialog,
)
from dyad_app.ui.helpers.get_badge_text import get_badge_text
from dyad_app.ui.provider_setup_box import provider_setup_box


def models_and_providers_settings():
    me.text("Providers", style=me.Style(font_size=20, font_weight=500))
    provider_setup_grid()
    me.button(
        "Add provider",
        on_click=lambda e: open_add_provider_dialog(),
        type="flat",
    )
    add_provider_dialog()
    me.divider()
    me.text("Custom models", style=me.Style(font_size=20, font_weight=500))
    custom_models_grid()
    me.button(
        "Add model",
        on_click=lambda e: open_add_model_dialog(),
        type="flat",
    )
    add_model_dialog()


def provider_setup_grid():
    with me.box(
        style=me.Style(
            display="grid",
            grid_template_columns="repeat(auto-fit, minmax(280px, 1fr))",
            gap=12,
            min_width=400,
        )
    ):
        for provider in get_language_model_providers():
            provider_setup_box(
                display_text=provider.display_name,
                provider=provider.id,
                badge_text=get_badge_text(provider.id),
            )


def custom_models_grid():
    with me.box(
        style=me.Style(
            display="grid",
            grid_template_columns="repeat(auto-fit, 280px)",
            gap=12,
            min_width=400,
        )
    ):
        for model in get_user_settings().custom_language_models:
            custom_model_box(model)


def custom_model_box(model: LanguageModel):
    def on_delete_custom_model(e: me.ClickEvent, model_id: str):
        get_user_settings().delete_custom_language_model(model_id).save()

    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            gap=4,
            background=me.theme_var("surface-container"),
            padding=me.Padding.all(12),
            border_radius=16,
            max_width=280,
        )
    ):
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="row",
                justify_content="space-between",
                gap=4,
            )
        ):
            with me.box(
                style=me.Style(display="flex", flex_direction="column")
            ):
                with me.box(
                    style=me.Style(display="flex", flex_direction="row", gap=4)
                ):
                    me.text("Display name:", style=me.Style(font_weight=500))
                    me.text(model.display_name)
                with me.box(
                    style=me.Style(display="flex", flex_direction="row", gap=4)
                ):
                    me.text("API name:", style=me.Style(font_weight=500))
                    me.text(model.name)
                with me.box(
                    style=me.Style(display="flex", flex_direction="row", gap=4)
                ):
                    me.text("Provider:", style=me.Style(font_weight=500))
                    me.text(model.provider)
                # with me.box(
                #     style=me.Style(display="flex", flex_direction="row", gap=4)
                # ):
                #     me.text("Type:", style=me.Style(font_weight=500))
                #     me.text(str(model.type))
            with me.tooltip(message="Delete custom model"):
                with me.content_button(
                    type="icon",
                    on_click=functools.partial(
                        on_delete_custom_model, model_id=model.id
                    ),
                ):
                    me.icon("delete")

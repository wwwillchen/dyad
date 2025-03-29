from functools import partial

import mesop as me
import mesop.labs as mel
from dyad import logger
from dyad.dyad_pro import is_dyad_pro_user
from dyad.language_model.language_model import LanguageModel, LanguageModelType
from dyad.language_model.language_model_clients import (
    get_language_model_provider,
    get_language_models,
    is_model_supported_by_proxy,
    is_provider_setup,
)
from dyad.settings.user_settings import get_user_settings
from pydantic import BaseModel, Field

from dyad_app.ui.provider_setup_dialog import open_provider_setup_dialog
from dyad_app.web_components.dialog import dialog


class SelectedModelState(BaseModel):
    models: dict[LanguageModelType, LanguageModel] = Field(default_factory=dict)


@me.stateclass
class DialogState:
    dialog_open: bool = False
    selected_model_state: SelectedModelState
    language_model_type: LanguageModelType = "core"
    filter_text: str = ""
    initial_selected_model_id: str | None = None
    initial_selected_type: LanguageModelType | None = None


def model_picker_dialog():
    dialog_state = me.state(DialogState)
    with dialog(open=dialog_state.dialog_open, on_close=on_close_dialog):
        with me.box(
            style=me.Style(
                width="100%",
                max_height="85vh",
                overflow="hidden",
                display="flex",
                flex_direction="column",
                padding=me.Padding(top=12, left=12, right=12, bottom=8),
            )
        ):
            with me.box(
                style=me.Style(
                    padding=me.Padding(bottom=12),
                    display="flex",
                    flex_direction="row",
                    justify_content="space-between",
                    align_items="center",
                    min_width="min(80vw, 360px)",
                )
            ):
                me.text(
                    "Select model",
                    style=me.Style(font_size=20, font_weight=500),
                )
            with me.box(
                style=me.Style(
                    display="flex",
                    justify_content="center",
                    padding=me.Padding(bottom=16),
                )
            ):
                me.button_toggle(
                    value=dialog_state.language_model_type,
                    on_change=on_change_language_model_type,
                    buttons=[
                        me.ButtonToggleButton(label="Core", value="core"),
                        me.ButtonToggleButton(label="Editor", value="editor"),
                        me.ButtonToggleButton(label="Router", value="router"),
                        me.ButtonToggleButton(
                            label="Reasoner", value="reasoner"
                        ),
                    ],
                )
            me.input(
                on_input=on_filter_change,
                placeholder="Filter models...",
                style=me.Style(width="100%"),
            )

            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="column",
                    gap=2,
                    overflow_y="auto",
                )
            ):
                models = get_language_models()

                # Updated sorting to prioritize initial and recently used models
                settings = get_user_settings()
                initial_id = dialog_state.initial_selected_model_id
                recently_used = settings.recently_used_models.get(
                    dialog_state.language_model_type, []
                )

                def model_sort_key(m: LanguageModel):
                    m_id = m.id
                    if m_id == initial_id:
                        group = 0
                        secondary = 0
                    elif m_id in recently_used:
                        group = 1
                        secondary = recently_used.index(m_id)
                    else:
                        group = (
                            2
                            if dialog_state.language_model_type in m.type
                            else 3
                        )
                        secondary = 0
                    recommended_rank = 0 if m.is_recommended else 1
                    return (
                        group,
                        secondary,
                        recommended_rank,
                        m.display_name.lower(),
                    )

                sorted_models = sorted(models, key=model_sort_key)

                # Track if we've shown the divider
                shown_divider = False
                for model in sorted_models:
                    # Do not show dyad models after the divider, because
                    # they are all "auto" models and it's not helpful.
                    if shown_divider and model.provider == "dyad":
                        continue
                    if (
                        not dialog_state.filter_text
                        or dialog_state.filter_text.lower()
                        in model.display_name.lower()
                        or dialog_state.filter_text.lower()
                        in get_language_model_provider(
                            model.provider
                        ).display_name.lower()
                    ):
                        # Show divider before first non-matching type model
                        # Skip the initially selected model when determining divider placement
                        if (
                            not shown_divider
                            and dialog_state.language_model_type
                            not in model.type
                            and model.id
                            != dialog_state.initial_selected_model_id
                        ):
                            with me.box(
                                style=me.Style(
                                    padding=me.Padding(top=16, bottom=8),
                                    display="flex",
                                    align_items="center",
                                    gap=8,
                                )
                            ):
                                with me.box(
                                    style=me.Style(
                                        flex_grow=1,
                                        height=1,
                                        background=me.theme_var(
                                            "outline-variant"
                                        ),
                                    )
                                ):
                                    pass
                                me.text(
                                    "All other models",
                                    style=me.Style(
                                        color=me.theme_var("outline"),
                                        font_size=12,
                                    ),
                                )
                                with me.box(
                                    style=me.Style(
                                        flex_grow=1,
                                        height=1,
                                        background=me.theme_var(
                                            "outline-variant"
                                        ),
                                    )
                                ):
                                    pass
                            shown_divider = True
                        model_option(model)

            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    justify_content="end",
                    gap=6,
                    padding=me.Padding(top=6),
                )
            ):
                me.button(
                    "Cancel",
                    on_click=lambda e: on_close_dialog(),
                )
                me.button(
                    "OK",
                    on_click=lambda e: on_save_model(),
                )


def on_change_language_model_type(e: me.ButtonToggleChangeEvent):
    state = me.state(DialogState)
    state.language_model_type = e.value  # type: ignore


def model_option(model: LanguageModel):
    dialog_state = me.state(DialogState)
    selected_id = (
        dialog_state.selected_model_state.models.get(
            dialog_state.language_model_type
        )
        and dialog_state.selected_model_state.models[
            dialog_state.language_model_type
        ].id
    ) or get_user_settings().language_model_type_to_id[
        dialog_state.language_model_type
    ]
    provider = get_language_model_provider(model.provider)
    is_model_selectable = (
        provider.id == "dyad"
        or is_provider_setup(provider.id)
        or (is_dyad_pro_user() and is_model_supported_by_proxy(model.id))
    )
    with me.box(
        on_click=on_change_model
        if is_model_selectable
        else partial(click_open_provider_setup_dialog, provider=provider.id),
        key=model.id,
        classes="hover-surface-container-high",
        style=me.Style(
            display="flex",
            background=me.theme_var("surface-container-highest")
            if selected_id == model.id
            else None,
            padding=me.Padding.all(8),
            border_radius=16,
            gap=12,
            align_items="center",
            cursor="pointer",
            line_height=1,
            font_size=15,
        ),
    ):
        me.icon(
            "check",
            style=me.Style(
                color=me.theme_var("primary"),
                visibility="hidden" if selected_id != model.id else None,
            ),
        )

        with me.box(
            style=me.Style(
                display="flex", flex_direction="column", gap=4, flex_grow=1
            )
        ):
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    align_items="center",
                    gap=8,
                )
            ):
                me.text(model.display_name, style=me.Style(font_weight=500))
                if model.is_recommended:
                    with me.box(
                        style=me.Style(
                            background=me.theme_var("primary-container"),
                            padding=me.Padding(
                                left=8, right=8, top=4, bottom=4
                            ),
                            border_radius=12,
                        )
                    ):
                        me.text(
                            "Recommended",
                            style=me.Style(
                                color=me.theme_var("on-primary-container"),
                                font_size=12,
                                font_weight=500,
                            ),
                        )
                if model.is_custom:
                    with me.box(
                        style=me.Style(
                            background=me.theme_var("primary-container"),
                            padding=me.Padding(
                                left=8, right=8, top=4, bottom=4
                            ),
                            border_radius=12,
                        )
                    ):
                        me.text(
                            "Custom",
                            style=me.Style(
                                color=me.theme_var("on-primary-container"),
                                font_size=12,
                                font_weight=500,
                            ),
                        )
                settings = get_user_settings()
                if model.id in settings.recently_used_models.get(
                    dialog_state.language_model_type, []
                ):
                    with me.box(
                        style=me.Style(
                            background=me.theme_var("secondary-container"),
                            padding=me.Padding(
                                left=8, right=8, top=4, bottom=4
                            ),
                            border_radius=12,
                        )
                    ):
                        me.text(
                            "Recently Used",
                            style=me.Style(
                                color=me.theme_var("on-secondary-container"),
                                font_size=12,
                                font_weight=500,
                            ),
                        )
            me.text(provider.display_name)
        if not is_model_selectable:
            me.text(
                "Setup required",
                style=me.Style(
                    width=80,
                    background=me.theme_var("surface-container-high"),
                    padding=me.Padding.symmetric(horizontal=12, vertical=8),
                    border_radius=12,
                    font_weight=500,
                    font_size=14,
                ),
            )


def click_open_provider_setup_dialog(e, provider: str):
    open_provider_setup_dialog(provider=provider)


def on_save_model(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    if state.selected_model_state.models:
        logger().info(
            "Saving models: %s",
            state.selected_model_state.models,
        )
        settings = get_user_settings()
        for model_type in state.selected_model_state.models:
            if state.selected_model_state.models[model_type]:
                model_id = state.selected_model_state.models[model_type].id
                settings.language_model_type_to_id[model_type] = model_id
                # Update recently used model for this type
                settings.update_recently_used_model(model_type, model_id)
        settings.save()
    state.dialog_open = False


def on_change_model(e: me.ClickEvent):
    state = me.state(DialogState)
    language_model = next(
        (model for model in get_language_models() if model.id == e.key),
        None,
    )
    assert language_model is not None
    state.selected_model_state.models[state.language_model_type] = (
        language_model
    )


def open_model_picker_dialog(language_model_type: LanguageModelType):
    state = me.state(DialogState)
    state.dialog_open = True
    state.selected_model_state = SelectedModelState()
    state.language_model_type = language_model_type
    state.filter_text = ""

    # Set both the initial selected model ID and type
    settings = get_user_settings()
    state.initial_selected_model_id = settings.language_model_type_to_id[
        language_model_type
    ]
    state.initial_selected_type = language_model_type


def is_model_picker_dialog_open():
    state = me.state(DialogState)
    return state.dialog_open


# Add new function for filter change handler
def on_filter_change(e: me.InputEvent):
    state = me.state(DialogState)
    state.filter_text = e.value


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False

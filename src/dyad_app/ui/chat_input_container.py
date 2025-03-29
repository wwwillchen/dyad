import mesop as me
import mesop.labs as mel
from dyad.language_model.language_model_clients import (
    get_editor_language_model,
    get_language_model,
    get_reasoner_language_model,
    get_router_language_model,
)
from dyad.logging.logging import logger
from dyad.settings.user_settings import (
    get_user_settings,
)
from dyad.storage.models.pad import get_pad

from dyad_app import chat_processor
from dyad_app.chat_processor import get_chat_files
from dyad_app.logic.chat_logic import submit_chat_msg
from dyad_app.ui.home_page_utils import CHAT_MAX_WIDTH
from dyad_app.ui.model_picker_dialog import (
    open_model_picker_dialog,
)
from dyad_app.ui.side_pane_state import (
    open_code_side_pane,
    set_side_pane,
)
from dyad_app.ui.state import (
    State,
    SuggestionsQuery,
)
from dyad_app.web_components.chat_input import chat_input
from dyad_app.web_components.copy_to_clipboard import (
    write_to_clipboard,
)


def chat_input_container():
    state = me.state(State)
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container-lowest"),
            border_radius="0 0 16px 16px",
        )
    ):
        with me.box(
            style=me.Style(
                background=(me.theme_var("surface-container-low")),
                border_radius=16,
                display="flex",
                flex_direction="column",
                margin=me.Margin.symmetric(horizontal="auto", vertical=8),
                padding=me.Padding.symmetric(horizontal=12, vertical=12),
                width=f"min({CHAT_MAX_WIDTH}, 90%)",
            )
        ):
            with me.box(style=me.Style(display="flex")):
                with me.box(
                    style=me.Style(
                        flex_grow=1,
                    )
                ):
                    input_state = state.input_state
                    chat_input(
                        key="chat_input",
                        value=input_state.raw_input,
                        clear_counter=input_state.clear_counter,
                        on_click_hashtag=on_click_hashtag,
                        on_send_chat=on_send_chat,
                        on_blur=on_chat_blur,
                        on_request_suggestions=on_request_suggestions,
                        on_suggestion_accepted=on_suggestion_accepted,
                        focus_counter=state.chat_input_focus_counter,
                        suggestions_query=input_state.suggestions_query,
                    )
                with me.box(
                    style=me.Style(
                        flex_shrink=0, display="flex", margin=me.Margin(left=8)
                    )
                ):
                    with me.content_button(
                        type="icon",
                        style=me.Style(margin=me.Margin(top=-8)),
                        on_click=on_click_copy_prompt,
                    ):
                        me.icon("content_copy")

                    if state.in_progress:
                        with me.content_button(
                            on_click=on_click_cancel_chat,
                            type="icon",
                            style=me.Style(margin=me.Margin(right=4, top=-8)),
                        ):
                            me.icon("cancel")

                    else:
                        with me.content_button(
                            on_click=on_click_submit_chat_msg,
                            type="icon",
                            style=me.Style(margin=me.Margin(right=-8, top=-8)),
                        ):
                            me.icon("send")
            with me.box(
                style=me.Style(display="flex", justify_content="space-between")
            ):
                model_summary_box()
                modes_box()


@me.stateclass
class PadModeState:
    counter: int = 0


def toggle_pad_mode(e: me.ClickEvent):
    user_settings = get_user_settings()
    user_settings.pad_mode = (
        "all" if user_settings.pad_mode == "learning" else "learning"
    )
    user_settings.save()
    me.state(PadModeState).counter += 1


def modes_box():
    with me.content_button(
        type="raised" if get_user_settings().pad_mode == "learning" else "flat",
        on_click=toggle_pad_mode,
        # button doesn't properly re-render
        key="pad-mode-button" + str(me.state(PadModeState).counter),
        color="accent",
    ):
        with me.box(
            style=me.Style(display="flex", align_items="center", gap=6)
        ):
            me.icon("description")
            me.text("Pad", style=me.Style(font_weight=500))


@me.stateclass
class ModelSummaryBoxState:
    is_open: bool = False


def toggle_model_summary_box(e: me.ClickEvent):
    state = me.state(ModelSummaryBoxState)
    state.is_open = not state.is_open


def model_summary_box():
    is_open = me.state(ModelSummaryBoxState).is_open
    with me.box(
        style=me.Style(
            padding=me.Padding(left=4),
            cursor="pointer",
            display="inline-flex",
            gap=4,
            font_size=14,
        )
    ):
        if me.viewport_size().width < 600:
            core_model_box(is_open=is_open)
            return
        with me.box(
            on_click=toggle_model_summary_box,
            style=me.Style(
                position="relative",
                top=4,
                cursor="pointer",
                border_radius=16,
                padding=me.Padding.symmetric(horizontal=4, vertical=4),
            ),
            classes="hover-surface-container-highest",
        ):
            me.icon(
                "keyboard_arrow_down" if is_open else "keyboard_arrow_up",
            )

        editor_model = get_editor_language_model()
        reasoner_model = get_reasoner_language_model()
        router_model = get_router_language_model()
        with me.box(
            style=me.Style(display="flex", flex_direction="column", gap=4)
        ):
            with me.box(style=me.Style(display="flex", gap=4)):
                core_model_box(is_open=is_open)
                me.text(
                    " / ",
                    style=me.Style(
                        visibility="visible" if is_open else "hidden",
                        transition="all 0.15s ease-in-out",
                    ),
                )
                with me.box(
                    on_click=lambda e: open_model_picker_dialog(
                        language_model_type="editor"
                    ),
                    style=me.Style(
                        display="inline-flex",
                        gap=4,
                        visibility="visible" if is_open else "hidden",
                        transition="all 0.15s ease-in-out",
                    ),
                ):
                    me.text(
                        "Editor:",
                        style=me.Style(
                            text_overflow="ellipsis",
                            overflow="hidden",
                            white_space="nowrap",
                        ),
                    )
                    me.text(
                        editor_model.display_name,
                        style=me.Style(
                            font_weight=500,
                            text_overflow="ellipsis",
                            overflow="hidden",
                            white_space="nowrap",
                        ),
                    )
            with me.box(
                style=me.Style(
                    display="flex",
                    gap=4,
                    visibility="visible" if is_open else "hidden",
                    transition="all 0.15s ease-in-out",
                )
            ):
                with me.box(
                    on_click=lambda e: open_model_picker_dialog(
                        language_model_type="router"
                    ),
                    style=me.Style(display="inline-flex", gap=4),
                ):
                    me.text(
                        "Router:",
                        style=me.Style(
                            text_overflow="ellipsis",
                            overflow="hidden",
                            white_space="nowrap",
                        ),
                    )
                    me.text(
                        router_model.display_name,
                        style=me.Style(
                            font_weight=500,
                            text_overflow="ellipsis",
                            overflow="hidden",
                            white_space="nowrap",
                        ),
                    )
                me.text(" / ")
                with me.box(
                    on_click=lambda e: open_model_picker_dialog(
                        language_model_type="reasoner"
                    ),
                    style=me.Style(display="inline-flex", gap=4),
                ):
                    me.text(
                        "Reasoner:",
                        style=me.Style(
                            text_overflow="ellipsis",
                            overflow="hidden",
                            white_space="nowrap",
                        ),
                    )
                    me.text(
                        reasoner_model.display_name,
                        style=me.Style(
                            font_weight=500,
                            text_overflow="ellipsis",
                            overflow="hidden",
                            white_space="nowrap",
                        ),
                    )


def core_model_box(is_open: bool):
    core_model = get_language_model(get_user_settings().core_language_model_id)
    with me.box(
        on_click=lambda e: open_model_picker_dialog(language_model_type="core"),
        style=me.Style(
            display="inline-flex",
            gap=4,
            position="relative",
            top=0 if is_open else 12,
            transition="top 0.15s ease-in-out",
        ),
    ):
        me.text(
            "Core:",
            style=me.Style(
                text_overflow="ellipsis",
                overflow="hidden",
                white_space="nowrap",
            ),
        )
        me.text(
            core_model.display_name,
            style=me.Style(
                font_weight=500,
                text_overflow="ellipsis",
                overflow="hidden",
                white_space="nowrap",
            ),
        )


def on_click_copy_prompt(e: me.ClickEvent):
    value = chat_processor.process_input_with_references(
        me.state(State).input_state.raw_input,
    )
    logger().debug("on_click_copy_prompt: %s", value)
    write_to_clipboard(value)


def on_suggestion_accepted(e: mel.WebEvent):
    value = e.value["suggestion"]["value"]
    if value.startswith("file:"):
        path = value[len("file:") :]
        open_code_side_pane(file_path=path)
    if value.startswith("pad:"):
        pad_id = value[len("pad:") :]
        open_pad_pane(pad_id)


def on_request_suggestions(e: mel.WebEvent):
    value = e.value["query"]
    state = me.state(State)
    state.input_state.suggestions_query = SuggestionsQuery(
        query=value, type=e.value["type"]
    )


def open_pad_pane(pad_id: str):
    state = me.state(State)
    pad = get_pad(pad_id)

    state.pad = pad
    set_side_pane("pad")


def on_chat_blur(e: mel.WebEvent):
    """Capture chat text input on blur."""
    state = me.state(State)
    state.input_state.raw_input = e.value["value"]
    state.input_state.json_input = e.value["jsonValue"]
    state.chat_files = get_chat_files(e.value["value"])


def on_click_hashtag(e: mel.WebEvent):
    value = e.value["value"]
    file_prefix = "file:"
    pad_prefix = "pad:"
    if value.startswith(file_prefix):
        path = value[len(file_prefix) :]
        open_code_side_pane(file_path=path)
    if value.startswith(pad_prefix):
        pad_id = value[len(pad_prefix) :]
        open_pad_pane(pad_id)


def on_send_chat(e: mel.WebEvent):
    state = me.state(State)
    state.input_state.raw_input = e.value["value"]
    logger().info("sending chat with input: %s", state.input_state)
    yield from submit_chat_msg()


def on_click_submit_chat_msg(e: me.ClickEvent):  # type: ignore
    yield from submit_chat_msg()


def on_click_cancel_chat(e: me.ClickEvent):
    state = me.state(State)
    state.is_chat_cancelled = True

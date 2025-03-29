import platform

import mesop as me
from dyad.prompts.prompts import set_academy_prompt
from dyad.storage.models.chat import (
    get_chat,
)

from dyad_app.academy.academy_prompt import create_academy_prompt
from dyad_app.academy.fetch_academy import fetch_academy_collections
from dyad_app.ui.apply_code_dialog import (
    apply_code_dialog,
    is_apply_code_dialog_open,
)
from dyad_app.ui.chat_input_container import chat_input_container
from dyad_app.ui.chat_ui import chat_pane, floating_scroll_to_bottom_button
from dyad_app.ui.default_pane import default_pane
from dyad_app.ui.delete_chat_dialog import (
    delete_chat_dialog,
    is_delete_chat_dialog_open,
)
from dyad_app.ui.model_picker_dialog import (
    is_model_picker_dialog_open,
    model_picker_dialog,
)
from dyad_app.ui.page_utils import SECURITY_POLICY, STYLESHEETS
from dyad_app.ui.payment_success_dialog import (
    is_payment_success_dialog_open,
    open_payment_success_dialog,
    payment_success_dialog,
)
from dyad_app.ui.poller import poll_status
from dyad_app.ui.rename_chat_dialog import (
    is_rename_chat_dialog_open,
    rename_chat_dialog,
)
from dyad_app.ui.scaffold import scaffold
from dyad_app.ui.share_chat_dialog import (
    is_share_chat_dialog_open,
    share_chat_dialog,
)
from dyad_app.ui.side_pane import (
    side_pane,
)
from dyad_app.ui.side_pane_state import get_side_pane, set_side_pane
from dyad_app.ui.state import (
    State,
    set_default_input_state,
)
from dyad_app.ui.theme_utils import load_theme_mode_from_settings
from dyad_app.web_components.copy_to_clipboard import copy_to_clipboard
from dyad_app.web_components.poller import poller
from dyad_app.web_components.scroller import scroller
from dyad_app.web_components.viewport_watcher import viewport_watcher


def on_load(e: me.LoadEvent):
    state = me.state(State)
    state.page = "chat"
    set_default_input_state()
    load_theme_mode_from_settings()
    if (
        "payment-success" in me.query_params
        and me.query_params["payment-success"] == "true"
    ):
        open_payment_success_dialog()
        del me.query_params["payment-success"]
    if "c" in me.query_params:
        try:
            chat = get_chat(me.query_params["c"])
            state.current_chat = chat
        except ValueError:
            state.top_error_message = "Chat not found"
    yield
    if not state.academy_data.collections:
        state.academy_data = fetch_academy_collections()
        set_academy_prompt(
            create_academy_prompt(state.academy_data.collections)
        )
    yield


@me.page(
    security_policy=SECURITY_POLICY,
    stylesheets=STYLESHEETS,
    title="Dyad",
    on_load=on_load,
)
def page():
    state = me.state(State)
    scroller(scroll_counter=state.scroll_counter)
    poller(on_poll=None if state.in_progress else lambda e: poll_status())
    if is_model_picker_dialog_open():
        model_picker_dialog()
    if is_delete_chat_dialog_open():
        delete_chat_dialog()
    if is_rename_chat_dialog_open():
        rename_chat_dialog()
    if is_apply_code_dialog_open():
        apply_code_dialog()
    if is_payment_success_dialog_open():
        payment_success_dialog()
    if is_share_chat_dialog_open():
        share_chat_dialog()
    copy_to_clipboard()

    with scaffold():
        if state.top_error_message:
            me.text(
                state.top_error_message,
                style=me.Style(color=me.theme_var("error")),
            )

        with me.box(
            style=me.Style(
                flex_grow=1,
                display="flex",
                flex_direction="row",
                overflow="hidden",
                position="relative",
                background=me.theme_var("surface-container-lowest"),
                border_radius="16px 0 0 0",
            )
        ):
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="column",
                    flex_grow=1,
                    position="relative",
                )
            ):
                with me.box(
                    style=me.Style(
                        overflow_y="scroll",
                        flex_grow=1,
                    ),
                    key="chat-scrollable-container",
                ):
                    if state.current_chat.turns:
                        with viewport_watcher():
                            floating_scroll_to_bottom_button()
                        chat_pane()
                    else:
                        default_pane()
            side_pane()
        chat_input_container()

    if state.current_chat.turns:
        side_pane_button()


def side_pane_button():
    with me.box(
        key="info-box",
        style=me.Style(
            background=me.theme_var("surface-container-high"),
            padding=me.Padding(left=6, right=4, bottom=12, top=12),
            cursor="pointer",
            height=44,
            border_radius="16px 0 0 16px",
            opacity=0.9,
            position="absolute",
            right=0,
            top=96,
            z_index=1,
            transition="padding 0.3s ease",
            visibility="hidden" if get_side_pane() else "visible",
        ),
        classes="hover-surface-container-highest hover-grow-side-pane-button",
        on_click=lambda e: set_side_pane("chat-files-overview"),
    ):
        with me.tooltip(
            message="Chat Overview " + "⌘+I"
            if platform.system() == "Darwin"
            else "Ctrl+I"
        ):
            me.icon("docs")

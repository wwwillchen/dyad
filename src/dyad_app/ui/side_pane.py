import mesop as me
import mesop.labs as mel
from dyad.settings.user_settings import get_user_settings
from dyad.storage.models.pad import save_pad

from dyad_app.ui.chat_files_pane import chat_files_pane
from dyad_app.ui.edit_code_pane import edit_code_pane
from dyad_app.ui.helper import icon_button
from dyad_app.ui.pad_pane import pad_pane, pad_pane_header_actions
from dyad_app.ui.side_pane_state import (
    get_side_pane,
    set_side_pane,
)
from dyad_app.ui.state import (
    State,
)
from dyad_app.web_components.editable_text import editable_text


def side_pane():
    state = me.state(State)
    if get_side_pane() == "chat-files-overview":
        width = (
            "min(max(240px, 35%), 300px)"
            if get_user_settings().sidebar_expanded
            else "300px"
        )
        with side_pane_scaffold(open=True, width=width, min_width=width):
            with me.box(
                style=me.Style(
                    display="flex", flex_direction="column", height="100%"
                )
            ):
                with side_pane_header(title="Code"):
                    me.box()
                chat_files_pane()
    if get_side_pane() == "pad":
        with side_pane_scaffold(
            open=True,
            width="min(min(max(480px, min(calc(100% - 280px), 80%)), 780px), 100%)",
        ):
            title = "No pad selected"
            if state.pad:
                title = state.pad.title
            pad_pane_header(title=title)
            pad_pane()
    if get_side_pane() == "edit-code":
        with side_pane_scaffold(
            open=True,
            width="min(min(calc(100% - 280px), 80%), 840px)",
        ):
            with side_pane_header(title=state.side_pane_file.path):
                me.box()
            edit_code_pane()

    # Need this for animation
    if get_side_pane() == "":
        with side_pane_scaffold(open=False):
            me.box()


def on_close_side_pane(e: me.ClickEvent):
    close_side_pane()


def close_side_pane():
    set_side_pane()


def pad_pane_header(*, title: str):
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="row",
            align_items="center",
            justify_content="space-between",
            gap=12,
        )
    ):
        icon_button(icon="close", on_click=on_close_side_pane, tooltip="")
        with me.box(style=me.Style(display="flex")):
            editable_text(
                value=title,
                on_blur=on_pad_title_blur,
            )
            with me.tooltip(message="Edit title", position="below"):
                me.icon("edit")
        pad_pane_header_actions()


def on_pad_title_blur(e: mel.WebEvent):
    state = me.state(State)
    if not state.pad:
        raise ValueError("No pad selected")
    state.pad.title = e.value["value"]
    save_pad(state.pad)


@me.content_component
def side_pane_header(*, title: str):
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="row",
            align_items="center",
            justify_content="space-between",
        )
    ):
        icon_button(icon="close", on_click=on_close_side_pane, tooltip="")
        me.text(
            title,
            style=me.Style(
                font_size=18,
                font_weight=600,
                margin=me.Margin(left=12, right=12),
            ),
        )
        me.slot()


@me.content_component
def side_pane_scaffold(*, open: bool, width="50%", min_width: int | str = 320):
    with me.box(
        key="side-pane-scaffold",
        style=me.Style(
            position="sticky",
            display="flex",
            flex_direction="column",
            background=me.theme_var("surface"),
            height="calc(100%-24px)",
            width=0 if not open else width,
            min_width=0 if not open else min_width,
            flex_shrink=0,
            margin=me.Margin(top=8, left=8, right=8) if open else None,
            padding=me.Padding.symmetric(vertical=8, horizontal=16)
            if open
            else None,
            border_radius=12,
            z_index=800,
            transition="width 0.3s ease",
            right=0,
        ),
    ):
        if open:
            me.slot()
        else:
            with me.box(style=me.Style(visibility="hidden")):
                me.slot()

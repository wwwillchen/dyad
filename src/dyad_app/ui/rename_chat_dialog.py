import mesop as me
import mesop.labs as mel
from dyad.storage.models.chat import update_chat_title

from dyad_app.web_components.dialog import dialog


@me.stateclass
class DialogState:
    dialog_open: bool = False
    new_title: str = ""
    chat_id: str = ""


def is_rename_chat_dialog_open():
    state = me.state(DialogState)
    return state.dialog_open


def rename_chat_dialog():
    dialog_state = me.state(DialogState)

    with dialog(open=dialog_state.dialog_open, on_close=on_close_dialog):
        with me.box(
            style=me.Style(
                width=400,
                padding=me.Padding.all(16),
                display="block",
            )
        ):
            with me.box(
                style=me.Style(
                    padding=me.Padding(bottom=12),
                    display="flex",
                    flex_direction="column",
                    gap=12,
                )
            ):
                me.text(
                    "Rename chat",
                    style=me.Style(font_size=24, font_weight=500),
                )
                me.input(
                    label="New title",
                    value=dialog_state.new_title,  # or get_chat(current_chat),
                    on_blur=on_title_change,
                    style=me.Style(width="360px"),
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
                    on_click=lambda e: on_close_dialog(),
                )
                me.button(
                    "Rename",
                    on_click=lambda e: on_rename_chat(),
                )


def on_rename_chat(e: mel.WebEvent | None = None):
    dialog_state = me.state(DialogState)

    if dialog_state.new_title.strip():
        update_chat_title(
            chat_id=dialog_state.chat_id, new_title=dialog_state.new_title
        )

    dialog_state.dialog_open = False
    dialog_state.new_title = ""


def on_title_change(e: me.InputBlurEvent):
    dialog_state = me.state(DialogState)
    dialog_state.new_title = e.value


def open_rename_chat_dialog(*, chat_title: str, chat_id: str):
    state = me.state(DialogState)
    state.new_title = chat_title
    state.chat_id = chat_id
    state.dialog_open = True


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False
    state.new_title = ""

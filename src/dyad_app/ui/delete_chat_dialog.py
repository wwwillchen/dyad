import mesop as me
import mesop.labs as mel
from dyad.chat import Chat
from dyad.storage.models.chat import delete_chat

from dyad_app.ui.state import State, set_current_chat
from dyad_app.web_components.dialog import dialog


@me.stateclass
class DialogState:
    dialog_open: bool = False


def is_delete_chat_dialog_open():
    state = me.state(DialogState)
    return state.dialog_open


def delete_chat_dialog():
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
                    flex_direction="row",
                    justify_content="space-between",
                    align_items="center",
                )
            ):
                me.text(
                    "Do you want to delete this chat?",
                    style=me.Style(font_size=24, font_weight=500),
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
                    "Delete",
                    on_click=lambda e: on_delete_chat(),
                )


def on_delete_chat(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False
    main_state = me.state(State)
    delete_chat(main_state.current_chat.id)
    set_current_chat(Chat())


def open_delete_chat_dialog():
    state = me.state(DialogState)
    state.dialog_open = True


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False

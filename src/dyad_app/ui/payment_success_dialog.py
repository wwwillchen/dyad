import mesop as me
import mesop.labs as mel

from dyad_app.web_components.dialog import dialog


@me.stateclass
class DialogState:
    dialog_open: bool = False


SUCCESS_MESSAGE = """
Congratulations! You have successfully subscribed to Dyad Pro.

Thank you for supporting Dyad!
"""


def payment_success_dialog():
    dialog_state = me.state(DialogState)
    with dialog(open=dialog_state.dialog_open, on_close=on_close_dialog):
        with me.box(style=me.Style(width="min(400px, 80vw)")):
            with me.box(
                style=me.Style(
                    padding=me.Padding(bottom=12),
                    display="flex",
                    flex_direction="column",
                    justify_content="space-between",
                )
            ):
                me.text(
                    "Subscription Successful",
                    style=me.Style(font_size=24, font_weight=500),
                )
                me.markdown(SUCCESS_MESSAGE)

            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row-reverse",
                    justify_content="end",
                    gap=6,
                    padding=me.Padding(top=12),
                )
            ):
                me.button(
                    "OK",
                    on_click=lambda e: on_close_dialog(),
                )


def is_payment_success_dialog_open():
    state = me.state(DialogState)
    return state.dialog_open


def open_payment_success_dialog():
    state = me.state(DialogState)
    state.dialog_open = True


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False

import mesop as me

from dyad_app.ui.state import State


def status_bar():
    state = me.state(State)
    if not state.status_by_type:
        me.box(style=me.Style(min_height=16))
        return
    with me.box(
        style=me.Style(
            display="flex",
            gap=16,
            padding=me.Padding.symmetric(vertical=2),
            justify_content="end",
            min_height=16,
            max_height=16,
        )
    ):
        for status in state.status_by_type.values():
            with me.box(
                style=me.Style(display="flex", gap=8, font_size="13.5px")
            ):
                me.text(
                    status.type.capitalize(), style=me.Style(font_weight=500)
                )
                me.text(status.text)
                if status.in_progress:
                    me.progress_spinner(diameter=16)

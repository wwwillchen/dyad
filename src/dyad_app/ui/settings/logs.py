import functools
from datetime import datetime

import mesop as me
from dyad.logging.logging import clear_logs, get_recent_logs


@me.stateclass
class LogState:
    expanded_log_ids: list[int]


def logs_settings():
    state = me.state(LogState)
    logs = get_recent_logs()

    # Add Clear Logs button
    with me.box(
        style=me.Style(
            display="flex",
            justify_content="end",
        )
    ):
        me.button(
            "Clear Logs",
            on_click=clear_logs_handler,
            type="flat",
            style=me.Style(
                color=me.theme_var("error"),
                background=me.theme_var("error-container"),
            ),
        )

    # Header
    COLUMNS = "1fr 120px 60px 150px"
    with me.box(
        style=me.Style(
            display="grid",
            grid_template_columns=COLUMNS,
            gap=12,
            width="100%",
        )
    ):
        me.text("Message", style=me.Style(font_weight=500))
        me.text("Timestamp", style=me.Style(font_weight=500))
        me.text("Level", style=me.Style(font_weight=500))
        me.text("Module", style=me.Style(font_weight=500))

    # Body
    with me.box(
        style=me.Style(
            display="grid",
            grid_template_columns=COLUMNS,
            gap=12,
            width="100%",
            overflow_y="auto",
            font_family="monospace",
            white_space="pre-wrap",
            font_size=14,
        )
    ):
        for log in logs:
            if len(log.message) < 100 or log.id in state.expanded_log_ids:
                me.text(log.message)
            else:
                with me.box(style=me.Style(display="inline")):
                    me.text(
                        log.message[:100] + "...",
                        style=me.Style(display="inline"),
                    )
                    with me.box(
                        style=me.Style(
                            display="inline",
                            cursor="pointer",
                            background=me.theme_var("surface-container"),
                            padding=me.Padding.symmetric(horizontal=4),
                            border_radius=4,
                        ),
                        on_click=functools.partial(expand_log, log_id=log.id),
                    ):
                        me.text(
                            f"Show more ({len(log.message) - 100} chars)",
                            style=me.Style(
                                color=me.theme_var("primary"),
                                display="inline",
                            ),
                        )
            me.text(
                f"{(datetime.utcnow() - log.timestamp).total_seconds():.0f} secs ago"
            )
            me.text(log.level)
            with me.tooltip(message=log.module):
                me.text(log.module)


def expand_log(e: me.ClickEvent, log_id: int):
    me.state(LogState).expanded_log_ids.append(log_id)


def clear_logs_handler(e: me.ClickEvent):
    clear_logs()

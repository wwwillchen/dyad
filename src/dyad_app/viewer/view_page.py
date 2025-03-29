import mesop as me
from dyad import agents as agents
from dyad.chat import Chat

from dyad_app.ui.helpers.button_link import button_link
from dyad_app.ui.side_pane import side_pane
from dyad_app.viewer.fetch_gist import fetch_gist
from dyad_app.viewer.view_chat_ui import (
    floating_scroll_to_bottom_button,
    view_chat_pane,
)
from dyad_app.viewer.view_state import ViewerState
from dyad_app.web_components.copy_to_clipboard import copy_to_clipboard
from dyad_app.web_components.gist_fetcher import gist_fetcher
from dyad_app.web_components.loading_block import loading_block
from dyad_app.web_components.scroller import scroller
from dyad_app.web_components.umami_script import umami_script
from dyad_app.web_components.viewport_watcher import viewport_watcher


def on_load(e):
    me.set_theme_mode("system")


def on_gist_loaded(e: me.WebEvent):
    state = me.state(ViewerState)
    if "error" in e.value:
        print(
            "Retrying with server: error loading gist from client",
            e.value["gistId"],
            "with error",
            e.value["error"],
        )
        chat = Chat.model_validate_json(fetch_gist(me.query_params["gist"]))
        state.current_chat = chat
        return
    files = e.value["gist"].keys()
    file = next(iter(files))
    chat = Chat.model_validate_json(e.value["gist"][file]["content"])
    state.current_chat = chat


@me.page(
    path="/",
    on_load=on_load,
    stylesheets=[
        "/static/styles.css",
        "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&display=swap",
    ],
    title="Dyad Viewer",
    security_policy=me.SecurityPolicy(
        allowed_connect_srcs=[
            "https://api-gateway.umami.dev",
            "https://api.github.com/",
        ],
        allowed_trusted_types=["umami"],
    ),
)
def page():
    state = me.state(ViewerState)
    if "gist" in me.query_params:
        gist_fetcher(
            gist_id=me.query_params["gist"], on_gist_loaded=on_gist_loaded
        )
    copy_to_clipboard()
    umami_script()
    scroller(scroll_counter=state.scroll_counter)
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container-low"),
            display="flex",
            flex_direction="column",
            height="100%",
            font_family="Geist",
        )
    ):
        header()
        body()


def header():
    with me.box(
        style=me.Style(
            display="flex",
            padding=me.Padding.all(16),
            gap=12,
            align_items="center",
            justify_content="space-between",
        )
    ):
        with me.box(
            style=me.Style(
                display="flex",
                gap=12,
                align_items="center",
            )
        ):
            me.image(
                src="/static/logo.png", style=me.Style(width=32, height=32)
            )
            me.text(
                "Dyad Viewer",
                style=me.Style(
                    font_size=20,
                    # font_weight=500,
                ),
            )
        with me.box(
            style=me.Style(display="flex", gap=16, align_items="center")
        ):
            if "gist" in me.query_params:
                me.link(
                    text="Open GitHub Gist",
                    url="https://gist.github.com/" + me.query_params["gist"],
                    style=me.Style(
                        color=me.theme_var("primary"), text_decoration="none"
                    ),
                    open_in_new_tab=True,
                )
            button_link(
                text="Get Dyad",
                url="https://www.dyad.sh/",
                color=me.theme_var("on-primary"),
                background=me.theme_var("primary"),
            )


def body():
    state = me.state(ViewerState)
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
                overflow="auto",
                background=me.theme_var("surface-container-lowest"),
                border_radius=16,
            )
        ):
            if state.current_chat.turns:
                with viewport_watcher():
                    floating_scroll_to_bottom_button()
                view_chat_pane()
            else:
                with me.box(
                    style=me.Style(
                        padding=me.Padding.all(16),
                        width="80%",
                        max_width=600,
                        margin=me.Margin.symmetric(
                            horizontal="auto", vertical=32
                        ),
                    )
                ):
                    me.text(
                        "Loading chat from GitHub Gist...",
                        style=me.Style(
                            font_weight=500,
                            font_size=14,
                            padding=me.Padding(bottom=12),
                        ),
                    )
                    loading_block()
        side_pane()

    # me.text(str(state.chat))

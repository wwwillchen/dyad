import platform

import dyad
import mesop as me
from dyad.dyad_pro import is_dyad_pro_enabled, is_dyad_pro_user
from dyad.extension import extension_registry
from dyad.settings.user_settings import get_user_settings

from dyad_app.logic.actions import register_action
from dyad_app.ui.helpers.button_link import button_link
from dyad_app.ui.share_chat_dialog import open_share_chat_dialog
from dyad_app.ui.state import State, new_chat
from dyad_app.web_components.menu import menu
from dyad_app.web_components.menu_item import menu_item as web_menu_item
from dyad_app.web_components.snackbar import extension_reloaded_snackbar

_APP_TITLE = "Dyad"


def click_share_chat(e: me.ClickEvent):
    open_share_chat_dialog()


def header(*, page_title: str | None = None):
    with me.box(
        style=me.Style(
            align_items="center",
            display="flex",
            gap=5,
            justify_content="end",
            padding=me.Padding.symmetric(vertical=12),
            width="100%",
        )
    ):
        with me.box(
            style=me.Style(
                position="absolute",
                top=8,
                left=80,
                z_index=800,
                display="flex",
                gap=8,
            ),
        ):
            with me.box(
                # Not a deliberate user intent to create a new chat.
                on_click=lambda e: new_chat(record_analytics=False),
                style=me.Style(cursor="pointer"),
            ):
                me.image(
                    src="/static/logo.png", style=me.Style(width=32, height=32)
                )
            me.text(
                _APP_TITLE
                if page_title is None
                else _APP_TITLE + " – " + page_title,  # noqa: RUF001
                style=me.Style(margin=me.Margin(bottom=0)),
                type="headline-6",
            )
        state = me.state(State)
        is_share_enabled = state.current_chat.turns and state.page == "chat"
        with me.content_button(
            type="stroked",
            style=me.Style(
                opacity=1 if is_share_enabled else 0,
                transition="all 0.3s ease-in-out",
            ),
            on_click=click_share_chat,
        ):
            with me.box(
                style=me.Style(display="flex", gap=4, align_items="center")
            ):
                me.icon(
                    "share",
                    style=me.Style(color=me.theme_var("on-surface")),
                )
                me.text(
                    "Share",
                    style=me.Style(color=me.theme_var("on-surface")),
                )
        me.text(
            "v" + dyad.__version__,
            style=me.Style(margin=me.Margin(left=12, right=8)),
        )
        if is_dyad_pro_enabled():
            button_link(
                text="Dyad Pro",
                url="https://academy.dyad.sh/settings",
                color=me.theme_var("on-primary-container"),
                background=me.theme_var("primary-container"),
            )
        elif is_dyad_pro_user():
            with me.tooltip(
                message="Go to Settings -> Advanced and enable LLM Proxy"
            ):
                button_link(
                    text="Dyad Pro (disabled)",
                    url="/settings?settings-pane=Advanced",
                    color=me.theme_var("on-surface"),
                    background=me.theme_var("surface-container-highest"),
                    same_tab=True,
                )
        else:
            button_link(
                text="Get Dyad Pro",
                url="https://www.dyad.sh/#plans",
                color=me.theme_var("on-primary"),
                background=me.theme_var("primary"),
            )

        with me.box(
            style=me.Style(
                display="flex",
                align_items="center",
                gap=8,
            )
        ):
            me.text("Workspace: " + get_user_settings().workspace_name())
            with me.content_button(
                type="icon",
                key="header-menu-button",
            ):
                me.icon("more_vert", style=me.Style(font_weight="bold"))

            with menu(trigger="[data-key='header-menu-button']"):
                with me.box(
                    style=me.Style(
                        display="flex",
                        flex_direction="column",
                        background=me.theme_var("surface-container"),
                        border_radius=8,
                        gap=12,
                    )
                ):
                    with web_menu_item():
                        me.link(
                            text="Read Docs",
                            url="https://docs.dyad.sh",
                            style=me.Style(
                                font_weight=500,
                                text_decoration="none",
                                color="inherit",
                                padding=me.Padding.symmetric(
                                    horizontal=16, vertical=12
                                ),
                            ),
                            open_in_new_tab=True,
                        )
                    with web_menu_item():
                        me.link(
                            text="Report Bug",
                            url="https://github.com/dyad-sh/dyad/issues/new",
                            style=me.Style(
                                font_weight=500,
                                text_decoration="none",
                                color="inherit",
                                padding=me.Padding.symmetric(
                                    horizontal=16, vertical=12
                                ),
                            ),
                            open_in_new_tab=True,
                        )
                    with web_menu_item():
                        with me.tooltip(
                            message="Keyboard shortcut: " + "⌘+⇧+E"
                            if platform.system() == "Darwin"
                            else "Ctrl+⇧+E"
                        ):
                            with me.box(
                                on_click=click_reload_extensions,
                                style=me.Style(
                                    font_weight=500,
                                    padding=me.Padding(
                                        left=8, right=16, top=12, bottom=12
                                    ),
                                    display="flex",
                                    align_items="center",
                                    gap=8,
                                ),
                            ):
                                me.icon("refresh")
                                me.text("Reload extensions")


def click_reload_extensions(e: me.ClickEvent):
    yield from reload_extensions()


def reload_extensions():
    yield from extension_reloaded_snackbar()
    extension_registry.extension_registry.reload_extensions()


register_action("reload-extensions", reload_extensions)

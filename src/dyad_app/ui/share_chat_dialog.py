import mesop as me
import mesop.labs as mel

from dyad_app.ui.state import State
from dyad_app.web_components.copy_to_clipboard import write_to_clipboard
from dyad_app.web_components.dialog import dialog


@me.stateclass
class ShareChatDialogState:
    dialog_open: bool = False
    gist_url: str = ""
    copied_content: bool = False
    copied_link: bool = False
    gist_url_error: str = ""


def share_chat_dialog():
    dialog_state = me.state(ShareChatDialogState)
    with dialog(open=dialog_state.dialog_open, on_close=on_close_dialog):
        with me.box(
            style=me.Style(
                width=450,
                display="flex",
                flex_direction="column",
                padding=me.Padding.all(16),
                gap=16,
            )
        ):
            # Dialog header
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    justify_content="space-between",
                    align_items="center",
                    padding=me.Padding(bottom=12),
                )
            ):
                me.text(
                    "Share Chat",
                    style=me.Style(font_size=24, font_weight=500),
                )

            # Step 1: Copy chat contents
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    align_items="center",
                    gap=12,
                    background=me.theme_var("surface-container-high"),
                    padding=me.Padding.all(12),
                    border_radius=8,
                )
            ):
                with me.box(
                    style=me.Style(
                        display="flex",
                        flex_direction="column",
                        flex_grow=1,
                    )
                ):
                    me.text(
                        "Step 1: Copy chat contents",
                        style=me.Style(font_weight=500),
                    )
                with me.tooltip(message="Copy chat content"):
                    with me.content_button(
                        type="icon",
                        on_click=lambda e: on_copy_content(),
                        style=me.Style(
                            color=me.theme_var(
                                "primary"
                                if not dialog_state.copied_content
                                else "tertiary"
                            )
                        ),
                    ):
                        me.icon("content_copy")

            # Step 2: Open GitHub Gist
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    align_items="center",
                    gap=12,
                    background=me.theme_var("surface-container-high"),
                    padding=me.Padding.all(12),
                    border_radius=8,
                )
            ):
                with me.box(
                    style=me.Style(
                        display="flex",
                        flex_direction="column",
                        flex_grow=1,
                    )
                ):
                    me.text(
                        "Step 2: Create a new GitHub Gist",
                        style=me.Style(font_weight=500),
                    )
                    with me.box(
                        style=me.Style(
                            display="flex",
                            flex_direction="row",
                            align_items="center",
                            gap=8,
                            padding=me.Padding(top=4),
                        )
                    ):
                        me.link(
                            text="Open GitHub Gist",
                            url="https://gist.github.com/",
                            open_in_new_tab=True,
                            style=me.Style(
                                color=me.theme_var("primary"),
                                text_decoration="none",
                            ),
                        )
                        me.icon(
                            "open_in_new",
                            style=me.Style(
                                font_size=18, color=me.theme_var("primary")
                            ),
                        )

            # Step 3: Input Gist URL
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="column",
                    gap=12,
                    background=me.theme_var("surface-container-high"),
                    padding=me.Padding.all(12),
                    border_radius=8,
                )
            ):
                me.text(
                    "Step 3: Share your Gist link",
                    style=me.Style(font_weight=500),
                )

                me.input(
                    placeholder="Paste your GitHub Gist URL here",
                    value=dialog_state.gist_url,
                    on_input=lambda e: set_gist_url(e.value),
                    style=me.Style(width="100%"),
                    hint_label=dialog_state.gist_url_error,
                )

                if dialog_state.gist_url:
                    with me.box(
                        style=me.Style(
                            display="flex",
                            flex_direction="row",
                            align_items="center",
                            background=me.theme_var(
                                "surface-container-highest"
                            ),
                            padding=me.Padding.all(8),
                            border_radius=4,
                            gap=8,
                        )
                    ):
                        with me.box(
                            style=me.Style(
                                overflow="hidden",
                                text_overflow="ellipsis",
                                white_space="nowrap",
                                flex_grow=1,
                            )
                        ):
                            me.text(get_share_url())
                        with me.tooltip(message="Copy sharing URL"):
                            with me.content_button(
                                type="icon",
                                on_click=lambda e: on_copy_link(),
                                style=me.Style(
                                    color=me.theme_var(
                                        "primary"
                                        if not dialog_state.copied_link
                                        else "tertiary"
                                    )
                                ),
                            ):
                                me.icon("content_copy")

            # Dialog actions
            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    justify_content="end",
                    gap=8,
                    padding=me.Padding(top=8),
                )
            ):
                me.button(
                    "Close",
                    on_click=lambda e: on_close_dialog(),
                )


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(ShareChatDialogState)
    state.dialog_open = False
    state.gist_url = ""
    state.gist_url_error = ""
    state.copied_content = False
    state.copied_link = False


def is_share_chat_dialog_open():
    return me.state(ShareChatDialogState).dialog_open


def open_share_chat_dialog():
    state = me.state(ShareChatDialogState)
    state.dialog_open = True
    state.copied_content = False
    state.copied_link = False


def on_copy_content(e: mel.WebEvent | None = None):
    state = me.state(ShareChatDialogState)
    state.copied_content = True
    write_to_clipboard(me.state(State).current_chat.model_dump_json())


def set_gist_url(url: str):
    """Set the Gist URL in the dialog state."""
    state = me.state(ShareChatDialogState)
    if not url.startswith("https://gist.github.com/"):
        state.gist_url_error = "Invalid Gist URL"
        return
    state.gist_url = url
    # Reset copied link status when URL changes
    state.copied_link = False


def on_copy_link(e: mel.WebEvent | None = None):
    """Copy the Gist link to the clipboard."""
    state = me.state(ShareChatDialogState)
    if state.gist_url:
        state.copied_link = True
        write_to_clipboard(get_share_url())


def get_share_url():
    """Convert GitHub Gist URL to share.dyad.sh URL."""
    state = me.state(ShareChatDialogState)
    gist_id = state.gist_url.split("/")[-1]
    return f"https://share.dyad.sh/?gist={gist_id}"

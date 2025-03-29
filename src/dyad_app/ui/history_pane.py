import re
from datetime import datetime, timedelta
from functools import partial

import mesop as me
from dyad import logger
from dyad.chat import ChatMetadata
from dyad.storage.models.chat import get_chat, get_chats, get_total_chats

from dyad_app.ui.delete_chat_dialog import open_delete_chat_dialog
from dyad_app.ui.rename_chat_dialog import open_rename_chat_dialog
from dyad_app.ui.state import State, set_current_chat
from dyad_app.ui.utils.pure_component import pure_component
from dyad_app.web_components.menu import menu
from dyad_app.web_components.menu_item import menu_item as web_menu_item


@me.stateclass
class HistoryPaneState:
    page_size: int = 50
    current_page: int = 1
    loaded_chats: list[ChatMetadata]
    __sentinel: ChatMetadata = None  # type: ignore


@pure_component
def chat_metadata_box(*, chat: ChatMetadata, index: int, is_current_chat: bool):
    with me.box(
        key=f"chat__{chat.id}",
        on_click=on_click_history,
        classes="hover-surface-container-high",
        style=me.Style(
            display="flex",
            align_items="center",
            background=(
                me.theme_var("surface-container-highest")
                if is_current_chat
                else None
            ),
            border_radius=8,
            cursor="pointer",
            margin=me.Margin.symmetric(horizontal=4),
            min_height=44,
            padding=me.Padding(top=4, bottom=4, left=12, right=28),
            text_overflow="ellipsis",
        ),
    ):
        with me.box(
            style=me.Style(
                display="flex",
                justify_content="space-between",
                align_items="center",
                flex_grow=1,
            )
        ):
            with me.box(classes="two-lines"):
                me.text(
                    _truncate_text(chat.title),
                    style=me.Style(word_wrap="anywhere", font_size=15),
                )
            with me.content_button(
                type="icon",
                key=f"chat-menu-button-{index}",
                style=me.Style(
                    visibility=None if is_current_chat else "hidden",
                ),
            ):
                me.icon("more_horiz")
        if is_current_chat:
            with menu(trigger=f"[data-key='chat-menu-button-{index}']"):
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
                        with me.box(
                            style=me.Style(
                                display="flex",
                                gap=8,
                                align_items="center",
                                cursor="pointer",
                                padding=me.Padding.all(8),
                            ),
                            on_click=partial(
                                on_click_rename_chat,
                                chat_title=chat.title,
                                chat_id=chat.id,
                            ),
                        ):
                            me.icon(
                                "edit",
                                style=me.Style(
                                    font_size=24,
                                    padding=me.Padding(top=2),
                                ),
                            )
                            me.text(
                                "Rename",
                                style=me.Style(font_weight=500),
                            )

                    with web_menu_item():
                        with me.box(
                            style=me.Style(
                                display="flex",
                                gap=8,
                                align_items="center",
                                cursor="pointer",
                                color=me.theme_var("error"),
                                padding=me.Padding.all(8),
                            ),
                            on_click=on_click_delete_chat,
                        ):
                            me.icon(
                                "delete",
                                style=me.Style(
                                    font_size=24,
                                    padding=me.Padding(top=2),
                                ),
                            )
                            me.text(
                                "Delete",
                                style=me.Style(font_weight=500),
                            )


def history_pane():
    state = me.state(State)
    history_state = me.state(HistoryPaneState)

    # New: Get the latest chat metadata from the database.
    latest_chats = get_chats(page=1, page_size=1)
    latest_chat_from_db = latest_chats[0] if latest_chats else None

    # Update: Check if we need to refresh chats
    should_load_first_page = (
        # Refresh if no chats are loaded
        len(history_state.loaded_chats) == 0
        or
        # Refresh if the current chat isn't in the list
        (
            state.current_chat.id
            and not any(
                chat.id == state.current_chat.id
                for chat in history_state.loaded_chats
            )
        )
        or
        # Refresh if the latest chat in the DB has a different updated_at timestamp than our loaded chats.
        (
            latest_chat_from_db
            and history_state.loaded_chats
            and latest_chat_from_db.updated_at
            != history_state.loaded_chats[0].updated_at
        )
    )

    if should_load_first_page:
        history_state.loaded_chats = get_chats(
            page=1, page_size=history_state.page_size
        )
        history_state.current_page = 1

    # Get additional pages if needed
    if (
        len(history_state.loaded_chats)
        < history_state.current_page * history_state.page_size
    ):
        additional_chats = get_chats(
            page=history_state.current_page, page_size=history_state.page_size
        )
        # Only add chats that aren't already in the list
        existing_ids = {chat.id for chat in history_state.loaded_chats}
        new_chats = [
            chat for chat in additional_chats if chat.id not in existing_ids
        ]
        history_state.loaded_chats.extend(new_chats)

    # Get current date and yesterday's date
    now = datetime.now().astimezone()
    today = now.date()
    yesterday = today - timedelta(days=1)

    # Get chats with pagination
    total_chats = get_total_chats()

    # Categorize all loaded chats
    today_chats: list[ChatMetadata] = []
    yesterday_chats: list[ChatMetadata] = []
    older_chats: list[ChatMetadata] = []

    for chat in history_state.loaded_chats:
        chat_date = chat.updated_at.date()
        if chat_date == today:
            today_chats.append(chat)
        elif chat_date == yesterday:
            yesterday_chats.append(chat)
        else:
            older_chats.append(chat)

    def render_chat_group(title: str, chats: list[ChatMetadata]):
        if not chats:
            return
        with me.box(style=me.Style(padding=me.Padding(left=12, top=8))):
            me.text(
                title,
                style=me.Style(
                    font_weight=500, color=me.theme_var("on-surface-variant")
                ),
            )
        for index, chat in enumerate(chats):
            chat_metadata_box(
                chat=chat,
                index=index,
                is_current_chat=state.current_chat.id == chat.id,
            )

    def on_load_more(e: me.ClickEvent):
        history_state.current_page += 1

    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            overflow_y="auto",
            flex_grow=1,
            gap=4,
        )
    ):
        render_chat_group("Today", today_chats)
        render_chat_group("Yesterday", yesterday_chats)
        render_chat_group("Older", older_chats)

        # Show load more button if there are more chats to load
        total_loaded = len(history_state.loaded_chats)
        if total_loaded < total_chats:
            with me.box(
                style=me.Style(
                    display="flex",
                    justify_content="center",
                    padding=me.Padding.symmetric(vertical=16),
                )
            ):
                with me.content_button(
                    on_click=on_load_more,
                    style=me.Style(
                        background=me.theme_var("surface-container-high"),
                        color=me.theme_var("primary"),
                    ),
                ):
                    me.text("Load More")


def on_click_history(e: me.ClickEvent):
    """Loads existing chat from history and saves current chat"""
    state = me.state(State)
    _, chat_index = e.key.split("__")
    # get_chats().current_chat_index = int(chat_index)
    for chat in me.state(HistoryPaneState).loaded_chats:
        if chat.id == chat_index:
            set_current_chat(get_chat(chat.id))
            break
    state.chat_input_focus_counter += 1


def on_click_delete_chat(e: me.ClickEvent):
    logger().info("User clicked delete chat")
    open_delete_chat_dialog()


def on_click_rename_chat(e: me.ClickEvent, *, chat_title: str, chat_id: str):
    logger().info("User clicked rename chat")
    open_rename_chat_dialog(chat_title=chat_title, chat_id=chat_id)


def _truncate_text(text: str, char_limit: int = 80) -> str:
    """Truncates text that is too long."""
    # Replace '#file:path/to/file' with '#filename'
    text = re.sub(r"#file:[^/]+/(?:[^/]+/)*([^/]+)", r"#\1", text)
    if len(text) <= char_limit:
        return text
    return text[:char_limit].rstrip(".,!?;:") + "..."

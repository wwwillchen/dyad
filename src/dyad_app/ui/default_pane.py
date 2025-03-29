import time
from functools import lru_cache, partial

import mesop as me
from dyad.chat import ChatMetadata
from dyad.dyad_pro import is_dyad_pro_user
from dyad.language_model.language_model_clients import (
    get_language_model_provider,
)
from dyad.storage.models.chat import get_chat, get_chats
from dyad.suggestions import (
    FileSuggestion,
    get_recent_file_suggestions,
)
from pydantic import BaseModel

from dyad_app.ui.helper import is_mobile
from dyad_app.ui.helpers.button_link import subscribe_to_dyad_pro_button_link
from dyad_app.ui.helpers.get_badge_text import get_badge_text
from dyad_app.ui.provider_setup_box import provider_setup_box
from dyad_app.ui.provider_setup_dialog import (
    provider_setup_dialog,
)
from dyad_app.ui.side_pane_state import open_code_side_pane
from dyad_app.ui.state import InputState, State, set_current_chat
from dyad_app.web_components.markdown import markdown

_EXAMPLE_USER_QUERIES = (
    "Review my code",
    "Tell me a joke",
    "How do I make a web component?",
)


class ExampleQuery(BaseModel):
    info: str
    text: str
    query: str


EXAMPLE_QUERIES = [
    ExampleQuery(
        info="Reference a file",
        text="Add comments to #file.py",
        query="Add comments to #",
    ),
    ExampleQuery(
        info="Review your code", text="@git review", query="@git review"
    ),
    ExampleQuery(
        info="Create a file",
        text="Create a React component called Counter.tsx",
        query="Create a React component called Counter.tsx",
    ),
]


def setup_models_box():
    me.text("Setup your models", style=me.Style(font_size=20))
    with me.box(
        style=me.Style(
            display="flex",
            flex_wrap="wrap",
            gap=12,
            padding=me.Padding(top=12),
            margin=me.Margin(bottom=12),
        )
    ):
        provider_setup_grid()
        provider_promo()


def provider_promo():
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container"),
            padding=me.Padding.all(16),
            border_radius=16,
            width=240,
            flex_grow=1,
        )
    ):
        me.text(
            "Get access to all the models for a single flat rate of $30/month with Dyad Pro",
            style=me.Style(font_size=16, line_height=1.5),
        )
        with me.box(
            style=me.Style(
                display="flex",
                justify_content="center",
                padding=me.Padding(top=16),
            )
        ):
            subscribe_to_dyad_pro_button_link()


def provider_setup_grid():
    with me.box(
        style=me.Style(
            display="grid",
            grid_template_columns="1fr 1fr",
            gap=12,
            flex_grow=2,
            min_width=400,
        )
    ):
        for provider_id in ["dyad", "openai", "anthropic", "google-genai"]:
            provider = get_language_model_provider(provider_id)
            provider_setup_box(
                display_text=provider.display_name,
                provider=provider.id,
                badge_text=get_badge_text(provider.id),
            )


def tip_box():
    return me.box(
        style=me.Style(
            # padding=me.Padding.all(16),
            border_radius=16,
            width=240,
            flex_grow=1,
            font_size=20,
            display="flex",
            flex_direction="column",
            gap=12,
        )
    )


def default_pane():
    provider_setup_dialog()

    with me.box(
        style=me.Style(
            margin=me.Margin.symmetric(horizontal="auto"),
            padding=me.Padding.all(16),
            max_width=840,
        )
    ):
        if not is_dyad_pro_user():
            setup_models_box()
        quick_actions()
        example_prompts()


def quick_actions():
    with me.box(
        style=me.Style(
            display="flex",
            flex_wrap="wrap",
            gap=12,
            padding=me.Padding(top=8),
        )
    ):
        with tip_box():
            me.text("Recent files")
            for file_suggestion in get_recent_file_suggestions(limit=3):
                file_suggestion_box(
                    file_suggestion,
                )
        with tip_box():
            me.text("Recent chats")
            recent_chats = get_chats(page=1, page_size=3)
            for chat in recent_chats:
                chat_box(chat)
            if not recent_chats:
                with me.box(
                    style=me.Style(
                        border=me.Border.all(
                            me.BorderSide(
                                width=1,
                                color=me.theme_var("outline-variant"),
                                style="solid",
                            )
                        ),
                        padding=me.Padding.all(12),
                        border_radius=16,
                        display="flex",
                        flex_direction="column",
                        gap=12,
                    )
                ):
                    me.text(
                        "Tip", style=me.Style(font_weight=500, font_size=14)
                    )
                    me.text(
                        "Start a conversation to see your recent chats here",
                        style=me.Style(font_size=16),
                    )


@lru_cache
def get_elapsed_time_str(modification_time: float) -> str:
    elapsed = time.time() - modification_time
    if elapsed < 60:
        return f"Last updated {elapsed:.0f} seconds ago"
    elif elapsed < 3600:
        minutes = elapsed // 60
        return f"Last updated {minutes:.0f} minutes ago"
    elif elapsed < 86400:
        hours = elapsed // 3600
        return f"Last updated {hours:.0f} hours ago"
    else:
        return "Last updated a while ago"


def chat_box(chat: ChatMetadata):
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container"),
            padding=me.Padding.all(12),
            border_radius=12,
            display="flex",
            justify_content="space-between",
            align_items="center",
            cursor="pointer",
        ),
        classes="hover-surface-container-high",
        on_click=partial(click_chat, chat_id=chat.id),
    ):
        with me.box(style=me.Style(display="flex", flex_direction="column")):
            me.text(
                get_elapsed_time_str(chat.updated_at.timestamp()),
                style=me.Style(font_size=12, color=me.theme_var("secondary")),
            )
            me.text(
                _truncate_text(chat.title),
                style=me.Style(
                    font_size=14,
                ),
            )

        me.icon("chevron_right")


def click_chat(e: me.ClickEvent, chat_id: str):
    state = me.state(State)

    set_current_chat(get_chat(chat_id))
    state.chat_input_focus_counter += 1


def _truncate_text(text: str, char_limit: int = 80) -> str:
    """Truncates text that is too long."""
    if len(text) <= char_limit:
        return text
    return text[:char_limit].rstrip(".,!?;:") + "..."


def file_suggestion_box(file_suggestion: FileSuggestion):
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container"),
            padding=me.Padding.symmetric(vertical=8, horizontal=12),
            border_radius=12,
            display="flex",
            justify_content="space-between",
            align_items="center",
            cursor="pointer",
        ),
        classes="hover-surface-container-high",
        on_click=partial(
            click_file,
            filepath=file_suggestion.filepath,
        ),
    ):
        with me.box(style=me.Style(display="flex", flex_direction="column")):
            me.text(
                get_elapsed_time_str(file_suggestion.modification_time),
                style=me.Style(font_size=12, color=me.theme_var("outline")),
            )
            me.text(
                file_suggestion.filename,
                style=me.Style(
                    font_size=16,
                    margin=me.Margin(top=4),
                ),
            )
            me.text(
                file_suggestion.dir_path,
                style=me.Style(font_size=13, color=me.theme_var("secondary")),
            )
        me.icon("chevron_right")


def click_file(e: me.ClickEvent, filepath: str):
    open_code_side_pane(file_path=filepath)
    query = "#file:" + filepath + " "
    set_query(e, query=query, focus=False)


def click_review_code(e: me.ClickEvent):
    pass


def example_prompts():
    with me.box(style=me.Style(margin=me.Margin(top=24), font_size=20)):
        me.text("Prompt examples")

    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column" if is_mobile() else "row",
            gap=20,
            margin=me.Margin(top=16),
        )
    ):
        for example in EXAMPLE_QUERIES:
            with me.box(
                on_click=partial(set_query, query=example.query),
                style=me.Style(
                    background=me.theme_var("surface-container"),
                    border_radius=15,
                    padding=me.Padding.all(20),
                    cursor="pointer",
                    width="33%",
                ),
                classes="hover-surface-container-high",
            ):
                me.text(
                    example.info,
                    style=me.Style(
                        font_size=15,
                        color=me.theme_var("outline"),
                        padding=me.Padding(bottom=12),
                    ),
                )
                with me.box(
                    style=me.Style(margin=me.Margin.symmetric(vertical=-16))
                ):
                    markdown(example.text)


def set_query(e: me.ClickEvent, *, query: str, focus=True):
    state = me.state(State)
    state.input_state = InputState(raw_input=query)
    if focus:
        state.chat_input_focus_counter += 1

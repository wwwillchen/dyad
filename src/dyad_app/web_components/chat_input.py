from collections.abc import Callable
from typing import Any

import mesop.labs as mel
from dyad.suggestions import get_suggestions
from dyad_app.ui.state import SuggestionsQuery
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def chat_input(
    *,
    value: str,
    suggestions_query: SuggestionsQuery | None,
    clear_counter: int,
    focus_counter: int,
    on_request_suggestions: Callable[[mel.WebEvent], Any],
    on_suggestion_accepted: Callable[[mel.WebEvent], Any],
    on_send_chat: Callable[[mel.WebEvent], Any],
    on_click_hashtag: Callable[[mel.WebEvent], Any],
    on_blur: Callable[[mel.WebEvent], Any],
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-chat-input",
        key=key,
        events={
            "sendChatEvent": on_send_chat,
            "blurEvent": on_blur,
            "hashtagClickEvent": on_click_hashtag,
            "requestSuggestionsEvent": on_request_suggestions,
            "suggestionAcceptedEvent": on_suggestion_accepted,
        },
        properties={
            "initialValue": value,
            "clearCounter": clear_counter,
            "focusCounter": focus_counter,
            "suggestions": get_suggestions(suggestions_query),
        },
    )

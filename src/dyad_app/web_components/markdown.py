from collections.abc import Callable
from typing import Any

import mesop as me
import mesop.labs as mel
from dyad.ui_proxy.ui_actions import Citations
from dyad_app.ui.state import State
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def markdown(
    content: str,
    *,
    citations: Citations | None = None,
    on_apply_code: Callable[[mel.WebEvent], Any] | None = None,
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-markdown",
        key=key,
        properties={
            "content": content,
            "citations": serialize_citations(citations) if citations else {},
            "darkTheme": me.theme_brightness() == "dark",
            "shouldAnimate": me.state(State).enable_auto_scroll,
        },
        events={
            "applyCodeEvent": on_apply_code,
        }
        if on_apply_code
        else None,
    )


def serialize_citations(citations: Citations) -> dict[str, Any]:
    serialized_citations = {}
    for key, citation in citations.items():
        serialized_citations[key] = citation.model_dump()
    return serialized_citations

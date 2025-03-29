from collections.abc import Callable
from typing import Any

import mesop as me
import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def code_editor(
    *,
    code: str,
    language: str,
    highlighted_line_number: int | None = None,
    on_updated_doc: Callable[[mel.WebEvent], Any],
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-code-editor",
        key=key,
        properties={
            "code": code,
            "language": language,
            "highlightedLineNumber": highlighted_line_number,
            "isDarkTheme": me.theme_brightness() == "dark",
        },
        events={
            "updatedDocEvent": on_updated_doc,
        },
    )

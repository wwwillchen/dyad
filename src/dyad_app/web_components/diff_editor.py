from collections.abc import Callable
from typing import Any

import mesop as me
import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def diff_editor(
    *,
    before_code: str,
    after_code: str,
    is_final: bool,
    language: str,
    on_updated_doc: Callable[[mel.WebEvent], Any],
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-diff-editor",
        key=key,
        properties={
            "language": language,
            "beforeCode": before_code,
            "afterCode": after_code,
            "isDarkTheme": me.theme_brightness() == "dark",
            "isFinal": is_final,
        },
        events={
            "updatedDocEvent": on_updated_doc,
        },
    )

from collections.abc import Callable
from typing import Any

import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def editable_text(
    *,
    value: str,
    on_blur: Callable[[mel.WebEvent], Any],
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-editable-text",
        key=key,
        events={
            "blurEvent": on_blur,
        },
        properties={
            "initialValue": value,
        },
    )

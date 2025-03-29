from collections.abc import Callable
from typing import Any

import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def pad_input(
    *,
    value: str,
    on_blur: Callable[[mel.WebEvent], Any],
    on_input: Callable[[mel.WebEvent], Any],
    disabled: bool = False,
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-pad-input",
        key=key,
        events={
            "blurEvent": on_blur,
            "inputEvent": on_input,
        },
        properties={
            "initialValue": value,
            "disabled": disabled,
        },
    )

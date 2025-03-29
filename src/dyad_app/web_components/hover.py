from collections.abc import Callable
from typing import Any

import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def hover(
    *,
    on_mouseover: Callable[[mel.WebEvent], Any],
    on_mouseout: Callable[[mel.WebEvent], Any],
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-hover",
        key=key,
        properties={},
        events={
            "mouseoverEvent": on_mouseover,
            "mouseoutEvent": on_mouseout,
        },
    )

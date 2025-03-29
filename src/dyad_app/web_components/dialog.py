from collections.abc import Callable
from typing import Any

import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def dialog(
    *,
    on_close: Callable[[mel.WebEvent], Any],
    open: bool,
    disable_soft_dismiss: bool = False,
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-dialog",
        key=key,
        properties={
            "open": open,
            "disableSoftDismiss": disable_soft_dismiss,
        },
        events={
            "closeDialogEvent": on_close,
        },
    )

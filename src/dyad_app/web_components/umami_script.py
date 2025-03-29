import mesop.labs as mel
from dyad_app.utils.web_components_utils import (
    get_js_bundle_path,
    is_viewer_mode,
)


@mel.web_component(path=get_js_bundle_path())
def umami_script(
    *,
    key: str | None = None,
):
    """
    Injects the Umami analytics script into the page.
    This component doesn't render any visible content.
    """
    if not is_viewer_mode():
        raise Exception("Umami script should only be included in viewer mode.")

    return mel.insert_web_component(
        name="dyad-umami-script",
        key=key,
        properties={},
    )

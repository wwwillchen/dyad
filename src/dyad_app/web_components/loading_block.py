import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def loading_block(
    *,
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-loading-block",
        key=key,
    )

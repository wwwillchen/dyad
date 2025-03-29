import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def poller(
    *,
    on_poll,
    key: str | None = None,
):
    return mel.insert_web_component(
        name="dyad-poller",
        key=key,
        events={
            "pollEvent": on_poll,
        },
    )

import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def gist_fetcher(
    *,
    on_gist_loaded,
    gist_id: str,
    gist_file: str = "",
    auto_fetch: bool = True,
    key: str | None = None,
):
    """
    A web component that fetches a GitHub gist and emits it as an event.

    Args:
        on_gist_loaded: Callback function to handle the gist data when it's loaded
        gist_id: The ID of the GitHub gist to fetch
        gist_file: Optional specific file to extract from the gist
        auto_fetch: Whether to fetch the gist automatically on component mount
        key: Optional unique identifier for the component

    Returns:
        A web component that fetches and emits GitHub gist data
    """
    return mel.insert_web_component(
        name="dyad-gist-fetcher",
        key=key,
        properties={
            "gistId": gist_id,
            "gistFile": gist_file,
            "autoFetch": auto_fetch,
        },
        events={
            "gistLoadedEvent": on_gist_loaded,
        },
    )

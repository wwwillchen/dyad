import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def link(
    *,
    href: str,
    target: str = "_self",
    rel: str = "",
    width: str = "",
    key: str | None = None,
):
    """
    Creates a link component that wraps content in an 'a' tag.

    Args:
        href: The URL that the link points to
        target: The target attribute specifies where to open the linked document
        rel: The relationship of the linked document to the current document
        key: Optional key for the component
    """
    return mel.insert_web_component(
        name="dyad-link",
        key=key,
        properties={
            "href": href,
            "target": target,
            "width": width,
            "rel": rel,
        },
    )

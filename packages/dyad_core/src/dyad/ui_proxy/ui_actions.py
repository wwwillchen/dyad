from collections.abc import Callable

from pydantic import BaseModel

from dyad.logging.logging import logger


# Keep in sync with
class Citation(BaseModel):
    title: str
    description: str
    url: str | None = None


Citations = dict[str, Citation]

_open_code_pane: Callable[[str], None] | None = None


def set_open_code_pane(func: Callable[[str], None]):
    global _open_code_pane
    _open_code_pane = func


def open_code_pane(file_path: str):
    if _open_code_pane:
        _open_code_pane(file_path)
    else:
        logger().warning("No open code pane function set")


_markdown: Callable[..., None] | None = None


def set_markdown_proxy(func: Callable[..., None]):
    global _markdown
    _markdown = func


def markdown(content: str, citations: Citations | None = None):
    if _markdown:
        _markdown(content=content, citations=citations)
    else:
        raise NotImplementedError("No markdown function set")

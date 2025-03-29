import mesop as me
import mesop.labs as mel
from dyad_app.utils.web_components_utils import get_js_bundle_path


@me.stateclass
class CopyToClipboardState:
    counter: int = 0
    text: str = ""


def write_to_clipboard(text: str):
    state = me.state(CopyToClipboardState)
    state.counter += 1
    state.text = text


@mel.web_component(path=get_js_bundle_path())
def copy_to_clipboard(
    *,
    key: str | None = None,
):
    state = me.state(CopyToClipboardState)
    return mel.insert_web_component(
        name="dyad-copy-to-clipboard",
        key=key,
        properties={
            "text": state.text,
            "counter": state.counter,
        },
    )

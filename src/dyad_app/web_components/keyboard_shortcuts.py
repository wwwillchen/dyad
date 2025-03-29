import mesop as me
import mesop.labs as mel
from dyad.settings.user_settings import toggle_sidebar_settings
from dyad_app.logic.actions import call_action
from dyad_app.ui.apply_code_dialog import is_apply_code_dialog_open
from dyad_app.ui.side_pane import close_side_pane
from dyad_app.ui.side_pane_state import get_side_pane, set_side_pane
from dyad_app.ui.state import focus_chat_input, new_chat
from dyad_app.utils.web_components_utils import get_js_bundle_path


@mel.web_component(path=get_js_bundle_path())
def keyboard_shortcuts():
    return mel.insert_web_component(
        name="dyad-keyboard-shortcuts",
        key=None,
        properties={},
        events={
            "newChatEvent": lambda e: navigate_new_chat(),
            "toggleSidebarEvent": lambda e: toggle_sidebar_settings(),
            "escapeEvent": lambda e: escape(),
            "focusChatEvent": lambda e: focus_chat_input(),
            "applyCodeEvent": apply_code,
            "reloadExtensionEvent": reload_extensions,
            "toggleChatFilesEvent": lambda e: toggle_chat_files_pane(),
        },
    )


def navigate_new_chat():
    me.navigate("/")
    new_chat()


def escape():
    close_side_pane()


def toggle_chat_files_pane():
    if get_side_pane() == "chat-files-overview":
        close_side_pane()
    else:
        set_side_pane("chat-files-overview")


def apply_code(e):
    if is_apply_code_dialog_open():
        call_action("apply-code-confirm")
        yield
    elif get_side_pane() == "chat-files-overview":
        yield from call_action("apply-code-all")


def reload_extensions(e):
    yield from call_action("reload-extensions")

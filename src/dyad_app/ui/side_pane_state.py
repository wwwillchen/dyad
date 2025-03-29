from collections.abc import Callable

import mesop as me
from dyad.logging.logging import logger
from dyad.todo_parser import get_todos
from dyad.ui_proxy.ui_actions import set_open_code_pane
from dyad.workspace_util import read_workspace_file

from dyad_app.ui.side_pane_type import SidePane
from dyad_app.ui.state import (
    CodeTodo,
    OpenedFile,
    State,
)


def get_side_pane() -> SidePane:
    return me.state(State).side_pane_open


def open_code_side_pane(
    file_path: str, todo_line_range: tuple[int, int] | None = None
):
    try:
        contents = read_workspace_file(file_path)
    except:  # noqa: E722
        return
    set_side_pane("edit-code")
    state = me.state(State)
    todos = [
        CodeTodo(
            code_context=t.code_context,
            text=t.text,
            line_range=t.line_range,
        )
        for t in get_todos(file_path)
    ]
    state.side_pane_file = OpenedFile(
        path=file_path,
        contents=contents,
        todos=todos,
    )
    if todo_line_range:
        for i, todo in enumerate(todos):
            if todo.line_range == todo_line_range:
                state.side_pane_file.selected_todo_index = i
                break
    state.todos_collapsed = not todos


set_open_code_pane(open_code_side_pane)


def set_side_pane(pane: SidePane = ""):
    state = me.state(State)
    if pane != get_side_pane():
        logger().info(f"Setting side pane to {pane}")
        if pane == "pad":
            reset_pad_pane_state()
        state.side_pane_open = pane


_reset_pad_pane_state = None


def reset_pad_pane_state():
    if _reset_pad_pane_state:
        _reset_pad_pane_state()
    else:
        raise ValueError("No reset pad pane state set")


def set_reset_pad_pane_state(reset_pad_pane_state: Callable[[], None]):
    global _reset_pad_pane_state
    _reset_pad_pane_state = reset_pad_pane_state


def is_side_pane_open() -> bool:
    return me.state(State).side_pane_open != ""

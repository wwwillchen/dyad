from functools import partial

import mesop as me
import mesop.labs as mel
from dyad.logging.logging import logger

from dyad_app.logic.chat_logic import submit_follow_up_prompt
from dyad_app.ui.side_pane_state import set_side_pane
from dyad_app.ui.state import (
    CodeTodo,
    State,
)
from dyad_app.utils.file_utils import get_language_from_file_path
from dyad_app.web_components.code_editor import code_editor


def edit_code_pane():
    state = me.state(State)
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            flex_grow=1,
            overflow="hidden",
        )
    ):
        with me.box(
            style=me.Style(
                display="flex",
                gap=8,
                height="100%",
            )
        ):
            todos_box()
            with me.box(
                style=me.Style(
                    overflow_y="auto",
                    flex_grow=1,
                )
            ):
                highlighted_line_number = None
                if state.side_pane_file.selected_todo_index is not None:
                    highlighted_line_number = state.side_pane_file.todos[
                        state.side_pane_file.selected_todo_index
                    ].line_range[0]
                code_editor(
                    code=state.side_pane_file.contents,
                    language=get_language_from_file_path(
                        state.side_pane_file.path
                    ),
                    highlighted_line_number=highlighted_line_number,
                    on_updated_doc=on_updated_doc,
                )


def todos_box():
    state = me.state(State)
    todos = state.side_pane_file.todos

    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            min_width=(state.todos_collapsed and 48) or 200,
            max_width=(state.todos_collapsed and 48) or 240,
            gap=8,
            overflow_y="auto",
            overflow_x="hidden",
            transition="all 0.2s ease-in-out",
        )
    ):
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="row",
                align_items="center",
                gap=8,
            )
        ):
            with me.content_button(
                type="icon",
                on_click=lambda _: setattr(
                    state, "todos_collapsed", not state.todos_collapsed
                ),
            ):
                me.icon(
                    icon="chevron_left"
                    if not state.todos_collapsed
                    else "chevron_right"
                )
            if not state.todos_collapsed:
                me.text("Autofix TODOs", style=me.Style(font_weight=500))

        if not state.todos_collapsed:
            if not todos:
                me.text("No TODOs found in the code")
            for index, todo in enumerate(todos):
                todo_box(todo, todo_index=index)


def click_todo(e: me.ClickEvent, todo_index: int):
    state = me.state(State)
    state.side_pane_file.selected_todo_index = todo_index


def todo_box(todo: CodeTodo, todo_index: int):
    state = me.state(State)
    is_active_todo = todo_index == state.side_pane_file.selected_todo_index
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container-high")
            if is_active_todo
            else me.theme_var("surface-container"),
            padding=me.Padding(top=8, bottom=8, left=8, right=4),
            border_radius=8,
            cursor="pointer",
            display="flex",
            flex_direction="row",
            gap=4,
        ),
        classes="hover-surface-container-highest",
        on_click=partial(click_todo, todo_index=todo_index),
    ):
        with me.box(style=me.Style(display="flex", flex_direction="column")):
            with me.tooltip(message=todo.text):
                me.text(
                    todo.text,
                    style=me.Style(
                        text_overflow="ellipsis",
                        overflow="hidden",
                        white_space="nowrap",
                    ),
                )
            me.text(
                todo.code_context,
                style=me.Style(
                    color=me.theme_var("on-surface"),
                    font_family="monospace",
                    text_overflow="ellipsis",
                    overflow="hidden",
                    white_space="nowrap",
                ),
            )
            me.text(
                f"L{todo.line_range[0]}-{todo.line_range[1]}",
                style=me.Style(color=me.theme_var("on-surface"), font_size=12),
            )

        with me.box(
            style=me.Style(
                flex_shrink=0, visibility=None if is_active_todo else "hidden"
            )
        ):
            with me.tooltip(message="Fix the TODO"):
                with me.content_button(
                    type="icon", color="primary", on_click=click_fix_todo
                ):
                    me.icon(icon="construction")


def click_fix_todo(e: me.ClickEvent):
    state = me.state(State)
    assert state.side_pane_file.selected_todo_index is not None
    selected_todo = state.side_pane_file.todos[
        state.side_pane_file.selected_todo_index
    ]
    prompt = f"""Fix the TODO: `{selected_todo.text}` located above this code: 
```
{selected_todo.code_context}
```
    in #file:{state.side_pane_file.path}."""
    set_side_pane()
    yield from submit_follow_up_prompt(prompt)


def on_updated_doc(e: mel.WebEvent):
    logger().info("Code updated (not implemented)")

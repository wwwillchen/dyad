import platform
from functools import partial
from typing import Literal

import mesop as me
import mesop.labs as mel
from dyad.apply_code import ApplyCodeCandidate, apply_code
from dyad.logging.logging import logger
from dyad.public.chat_message import Checkpoint, Content
from dyad.storage.checkpoint.file_checkpoint import use_checkpoint
from dyad.storage.models.chat import save_chat
from dyad.utils.safe_next import safe_next

from dyad_app.logic.actions import register_action
from dyad_app.ui.state import (
    State,
)
from dyad_app.utils.file_utils import get_language_from_file_path
from dyad_app.web_components.dialog import dialog
from dyad_app.web_components.diff_editor import diff_editor


@me.stateclass
class ApplyCodeDialogState:
    dialog_open: bool = False
    mode: Literal["apply", "revert"] = "apply"
    current_file_path: str
    checkpoint: Checkpoint | None = None


def calculate_completion_percentage(candidate: ApplyCodeCandidate):
    if not candidate:
        return 0.0

    # If we have final code, we're done
    if candidate.final_code:
        return 100.0

    # If we have after_code but no before_code, this is a new file
    if not candidate.before_code and candidate.after_code:
        return 100.0

    # If we have neither, something's wrong
    if not candidate.before_code and not candidate.after_code:
        return 0.0

    # Calculate percentage for existing files being modified
    total_lines = len(candidate.before_code.splitlines())
    if total_lines == 0:
        return 100.0

    processed_lines = len(
        candidate.after_code.splitlines() if candidate.after_code else ""
    )
    score = (processed_lines / total_lines) * 100.0
    return min(100.0, score)


def calculate_total_completion_percentage():
    file_states = me.state(State).apply_code_state.file_states
    if not file_states:
        return 0.0

    total_percentage = 0.0
    file_count = len(file_states)

    for file_state in file_states.values():
        if file_state.candidate:
            total_percentage += calculate_completion_percentage(
                file_state.candidate
            )

    return total_percentage / file_count if file_count > 0 else 0.0


def open_apply_code_dialog(checkpoint: Checkpoint | None = None):
    dialog_state = me.state(ApplyCodeDialogState)
    dialog_state.dialog_open = True
    if checkpoint:
        dialog_state.checkpoint = checkpoint
        dialog_state.mode = "revert"
    else:
        dialog_state.mode = "apply"
        dialog_state.checkpoint = None


def is_apply_code_dialog_open():
    return me.state(ApplyCodeDialogState).dialog_open


def on_click_apply_code(e: me.ClickEvent):
    if me.state(ApplyCodeDialogState).mode == "revert":
        revert_code_confirm()
    else:
        apply_code_confirm()


def revert_code_confirm():
    checkpoint = me.state(ApplyCodeDialogState).checkpoint
    assert checkpoint is not None
    revert_to_checkpoint(checkpoint)


def revert_to_checkpoint(checkpoint: Checkpoint):
    for file_revision in checkpoint.files:
        use_checkpoint(file_revision)

    for message in me.state(State).current_chat.current_messages:
        for child in message.content.children:
            if clear_checkpoint_recursive(message.content, child, checkpoint):
                save_chat(me.state(State).current_chat)
                on_close_dialog()
                return

    raise Exception("Could not clear checkpoint")


def clear_checkpoint_recursive(
    parent: Content, content: Content, checkpoint: Checkpoint
):
    if content.internal_checkpoint == checkpoint:
        parent.children.remove(content)
        return True

    # Iterate over a copy of content.children to allow safe removal during iteration.
    return any(
        clear_checkpoint_recursive(content, child, checkpoint)
        for child in list(content.children)
    )


def apply_code_confirm():
    logger().info("Applying code - confirmed")
    state = me.state(State)
    origin = state.apply_code_state.origin
    checkpoint = Checkpoint()
    parent_content = (
        state.current_chat.turns[origin.turn_index]
        .messages[origin.message_index]
        .content
    )
    if parent_content.children:
        parent_content = parent_content.children[-1]
    child_content = Content()
    parent_content.add_child(child_content)
    child_content.internal_checkpoint = checkpoint
    for file_path in state.apply_code_state.file_states:
        file_state = state.apply_code_state.file_states[file_path]
        assert file_state.candidate is not None
        file_revision = apply_code(file_state.candidate)
        checkpoint.files.append(file_revision)
    save_chat(state.current_chat)
    on_close_dialog()


register_action("apply-code-confirm", apply_code_confirm)


def is_generating_candidates_done():
    state = me.state(State)
    for file_path in state.apply_code_state.file_states:
        file_state = state.apply_code_state.file_states[file_path]
        if file_state.candidate is None:
            return False
        if not file_state.candidate.final_code:
            return False
    return True


def apply_code_button():
    is_done = is_generating_candidates_done()
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            gap=4,
            align_items="center",
            padding=me.Padding(right=12),
        )
    ):
        me.button(
            label="Apply",
            on_click=on_click_apply_code,
            type="flat",
            disabled=not is_done,
        )
        shortcut_key = (
            "⌘+Enter" if platform.system() == "Darwin" else "Ctrl+Enter"
        )
        me.text(
            f"({shortcut_key})",
            style=me.Style(
                font_size="13px",
            ),
        )
    # else:
    #     me.progress_spinner(diameter=36)


def get_current_file_state():
    state = me.state(State)
    dialog_state = me.state(ApplyCodeDialogState)
    if dialog_state.current_file_path:
        return state.apply_code_state.file_states[
            dialog_state.current_file_path
        ]
    else:
        return safe_next(iter(state.apply_code_state.file_states.values()))


def apply_code_dialog():
    state = me.state(State)
    dialog_state = me.state(ApplyCodeDialogState)

    with dialog(
        key="apply-code-dialog",
        open=dialog_state.dialog_open,
        on_close=lambda e: on_close_dialog(),
    ):
        total_completion = 0
        current_file_state = None
        if dialog_state.dialog_open and state.apply_code_state.file_states:
            current_file_state = get_current_file_state()
            total_completion = calculate_total_completion_percentage()
        has_error = (
            current_file_state
            and current_file_state.candidate
            and current_file_state.candidate.error_message
        )
        # Progress bar
        if not is_generating_candidates_done() and not has_error:
            with me.box(
                style=me.Style(
                    margin=me.Margin(bottom=12),
                )
            ):
                me.progress_bar(
                    value=total_completion,
                    mode="determinate"
                    if total_completion > 0
                    else "indeterminate",
                )
                with me.box(
                    style=me.Style(
                        display="flex",
                        justify_content="center",
                        margin=me.Margin(top=4),
                    )
                ):
                    me.text(
                        f"Overall progress: {total_completion:.0f}% complete",
                        style=me.Style(
                            font_size="13px",
                            color=me.theme_var("on-surface-variant"),
                        ),
                    )
        if has_error:
            with me.box(
                style=me.Style(
                    display="flex",
                    justify_content="center",
                    position="absolute",
                    width="100%",
                )
            ):
                with me.box(
                    style=me.Style(
                        display="block",
                        margin=me.Margin(left=48, bottom=12),
                        background=me.theme_var("error-container"),
                        padding=me.Padding.all(12),
                        border_radius=8,
                        color=me.theme_var("on-error-container"),
                        max_width="600px",
                        z_index=9,
                    )
                ):
                    me.text(
                        current_file_state.candidate.error_message,  # type: ignore
                    )

        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="row",
                height="calc(100vh - 96px)",
                width="calc(100vw - 32px)",
                overflow="hidden",
                padding=me.Padding(top=16),
            )
        ):
            with me.content_button(
                type="icon",
                on_click=lambda e: on_close_dialog(),
                style=me.Style(position="absolute", top=0, left=0),
            ):
                me.icon("close")
            # Left side - File list
            with me.box(
                style=me.Style(
                    width="180px",
                    flex_shrink=0,
                    flex_grow=0,
                    padding=me.Padding(left=8, top=16, bottom=16),
                    border_radius=12,
                    display="flex",
                    flex_direction="column",
                    gap=12,
                    margin=me.Margin(right=16),
                ),
            ):
                me.text(
                    "Files",
                    style=me.Style(
                        font_weight="bold",
                        font_size=18,
                        margin=me.Margin(top=8, bottom=8),
                    ),
                )

                for file_path in state.apply_code_state.file_states:
                    file_state = state.apply_code_state.file_states[file_path]
                    completion = (
                        calculate_completion_percentage(file_state.candidate)
                        if file_state.candidate
                        else 0.0
                    )

                    with me.box(
                        on_click=partial(
                            click_select_file, file_path=file_path
                        ),
                        style=me.Style(
                            display="flex",
                            align_items="center",
                            gap=8,
                            padding=me.Padding.all(8),
                            cursor="pointer",
                            background=me.theme_var("surface-container-high")
                            if current_file_state
                            and current_file_state.plan
                            and current_file_state.plan.file_path == file_path
                            else me.theme_var("surface-container-low"),
                            border_radius=8,
                        ),
                        classes="hover-surface-container-highest",
                    ):
                        # Progress circle container
                        with me.box(
                            style=me.Style(
                                width="24px",
                                height="24px",
                                position="relative",
                                display="flex",
                                align_items="center",
                                justify_content="center",
                            )
                        ):
                            if (
                                file_state.candidate
                                and file_state.candidate.error_message
                            ):
                                me.icon(
                                    "error",
                                    style=me.Style(
                                        color=me.theme_var("error"),
                                    ),
                                )
                            elif completion < 100:
                                me.progress_spinner(
                                    diameter=24, color="accent", stroke_width=3
                                )
                            else:
                                me.icon(
                                    "check_circle",
                                    style=me.Style(
                                        color=me.theme_var("tertiary"),
                                    ),
                                )

                        with me.box(
                            style=me.Style(
                                display="flex",
                                flex_direction="column",
                                flex_grow=1,
                            )
                        ):
                            path_parts = file_path.split("/")
                            filename = path_parts[-1]
                            directory = (
                                "/".join(path_parts[:-1])
                                if len(path_parts) > 1
                                else ""
                            )

                            me.text(
                                filename,
                                style=me.Style(
                                    font_weight=500,
                                    white_space="nowrap",
                                    text_overflow="ellipsis",
                                    overflow="hidden",
                                ),
                            )
                            if directory:
                                with me.tooltip(message=directory):
                                    me.text(
                                        directory,
                                        style=me.Style(
                                            font_size=14,
                                            color=me.theme_var(
                                                "on-surface-variant"
                                            ),
                                            white_space="nowrap",
                                            text_overflow="ellipsis",
                                            overflow="hidden",
                                        ),
                                    )

            # Right side - Diff viewer and controls
            with me.box(
                style=me.Style(
                    flex_grow=1,
                    display="flex",
                    flex_direction="column",
                    gap=4,
                )
            ):
                # Header with controls
                with me.box(
                    style=me.Style(
                        display="flex",
                        justify_content="space-between",
                        align_items="center",
                        padding=me.Padding(bottom=12),
                    )
                ):
                    me.text(
                        "Review Changes",
                        style=me.Style(font_weight="bold", font_size=24),
                    )
                    with me.box(
                        style=me.Style(
                            display="flex",
                            gap=12,
                            align_items="center",
                        )
                    ):
                        apply_code_button()

                # Diff viewer
                if current_file_state and current_file_state.plan:
                    with me.box(
                        style=me.Style(
                            flex_grow=1,
                            border_radius=4,
                            overflow="auto",
                        )
                    ):
                        candidate = current_file_state.candidate
                        if candidate:
                            diff_editor(
                                key=candidate.file_path,
                                before_code=candidate.before_code,
                                after_code=candidate.after_code,
                                is_final=bool(candidate.final_code),
                                language=get_language_from_file_path(
                                    candidate.file_path
                                ),
                                on_updated_doc=on_updated_doc,
                            )


def click_select_file(e: me.ClickEvent, file_path: str):
    dialog_state = me.state(ApplyCodeDialogState)
    dialog_state.current_file_path = file_path


def on_updated_doc(e: mel.WebEvent):
    current_file_state = get_current_file_state()
    candidate = current_file_state.candidate
    assert candidate is not None
    candidate.final_code = e.value["doc"]


def on_close_dialog():
    dialog_state = me.state(ApplyCodeDialogState)
    dialog_state.dialog_open = False
    dialog_state.current_file_path = ""
    dialog_state.checkpoint = None
    dialog_state.mode = "apply"
    me.state(State).apply_code_state.file_states = {}

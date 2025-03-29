import os
import platform
from functools import partial

import mesop as me
from dyad.public.chat_message import ChatMessage, Checkpoint

from dyad_app.logic.apply_code import (
    ChatFilesPaneState,
    apply_all_code_changes,
)
from dyad_app.logic.chat_files import (
    extract_partial_code_blocks,
    get_message,
)
from dyad_app.logic.revert_code import propose_revert_to_checkpoint
from dyad_app.ui.state import State


def change_message(e: me.ClickEvent, delta: int):
    state = me.state(ChatFilesPaneState)
    message_length = len(me.state(State).current_chat.current_messages)
    current_index = state.message_index
    if current_index == -1:
        current_index = message_length - 1
    state.message_index = max(
        -1, min(current_index + delta * 2, message_length - 1)
    )


def message_selector():
    state = me.state(ChatFilesPaneState)
    message_length = len(me.state(State).current_chat.current_messages)
    with me.box(
        style=me.Style(
            display="flex",
            gap=8,
            align_items="center",
            justify_content="space-between",
        )
    ):
        with me.content_button(
            type="icon",
            on_click=partial(change_message, delta=-1),
            disabled=state.message_index == 1,
        ):
            me.icon("keyboard_arrow_left")
        if state.message_index == -1:
            me.text("Last message")
        else:
            me.text("Message: " + str(int((state.message_index + 1) / 2)))
        with me.content_button(
            type="icon",
            on_click=partial(change_message, delta=1),
            disabled=state.message_index == -1
            or state.message_index >= message_length - 1,
        ):
            me.icon("keyboard_arrow_right")


def chat_files_pane():
    message_selector()
    me.box(style=me.Style(height=12))
    files_changed_box()
    me.box(style=me.Style(height=12))
    revision_box()


def revision_box():
    state = me.state(ChatFilesPaneState)
    current_message = get_message(index=state.message_index)
    checkpoint = find_checkpoint(current_message) if current_message else None
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            gap=4,
            background=me.theme_var("surface-container-high"),
            padding=me.Padding.all(8),
            border_radius=8,
            overflow="hidden",
        )
    ):
        with me.box(
            style=me.Style(
                display="flex",
                gap=8,
                align_items="center",
                padding=me.Padding(bottom=4, left=4),
            )
        ):
            me.text("Checkpoints", style=me.Style(font_weight=500))
            with me.tooltip(message="Undo changes from apply code"):
                me.icon("info", style=me.Style(font_size=24))
        with me.box(
            style=me.Style(
                padding=me.Padding.symmetric(vertical=4),
                display="flex",
                flex_direction="column",
                gap=4,
                overflow="auto",
            )
        ):
            if checkpoint:
                for file in checkpoint.files:
                    with me.box(style=me.Style(display="flex", gap=4)):
                        me.icon("description")
                        filename = os.path.basename(file.original_path)
                        me.text(
                            filename,
                            style=me.Style(
                                overflow="hidden",
                                text_overflow="ellipsis",
                                white_space="nowrap",
                            ),
                        )

            else:
                me.text("No checkpoints")
        if checkpoint:
            with me.content_button(
                on_click=partial(
                    click_revert_checkpoint,
                    checkpoint_str=checkpoint.model_dump_json(),
                ),
                key="revert-to-checkpoint-chat-files-pane",
            ):
                with me.box(
                    style=me.Style(display="flex", gap=4, align_items="center")
                ):
                    me.icon("undo")
                    me.text("Revert to checkpoint")


def click_revert_checkpoint(e: me.ClickEvent, checkpoint_str: str):
    checkpoint = Checkpoint.model_validate_json(checkpoint_str)
    propose_revert_to_checkpoint(checkpoint)


def find_checkpoint(message: ChatMessage) -> Checkpoint | None:
    queue = []
    queue.extend(message.content.children)
    while queue:
        content = queue.pop(0)
        if content.internal_checkpoint:
            return content.internal_checkpoint
        queue.extend(content.children)
    return None


def files_changed_box():
    state = me.state(ChatFilesPaneState)
    current_message = get_message(index=state.message_index)
    s = me.state(State)
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            gap=4,
            background=me.theme_var("surface-container-high"),
            padding=me.Padding.all(8),
            border_radius=8,
            overflow="hidden",
        )
    ):
        with me.box(
            style=me.Style(
                display="flex",
                gap=8,
                align_items="center",
                padding=me.Padding(bottom=4, left=4),
            )
        ):
            me.text("Files changed", style=me.Style(font_weight=500))
            with me.tooltip(message="Files changed in the latest message"):
                me.icon("info", style=me.Style(font_size=24))
        if not s.current_chat:
            me.text("No chat selected")
            return
        if not current_message:
            me.text("No messages")
            return

        message_content = current_message.content.get_text()
        if not message_content:
            me.text("No content in the message")
            return

        code_blocks = extract_partial_code_blocks(message_content)

        if not code_blocks:
            me.text("No files found in the latest message")
            return
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="column",
                gap=4,
                overflow="auto",
                padding=me.Padding.symmetric(vertical=2),
            )
        ):
            for block in code_blocks:
                with me.box(
                    style=me.Style(display="flex", align_items="center", gap=6)
                ):
                    me.icon("edit" if block.exists else "add")
                    with me.tooltip(
                        message=f"{block.filepath} ({'edit' if block.exists else 'new file'})"
                    ):
                        filename = os.path.basename(block.filepath)
                        me.text(
                            filename,
                            style=me.Style(
                                overflow="hidden",
                                text_overflow="ellipsis",
                                white_space="nowrap",
                            ),
                        )

        with me.box(
            style=me.Style(display="flex", gap=8, align_items="center")
        ):
            with me.box(
                style=me.Style(display="flex", gap=4, align_items="center")
            ):
                with me.content_button(
                    disabled=s.in_progress,
                    on_click=click_apply_all,
                ):
                    with me.box(
                        style=me.Style(
                            display="flex", gap=4, align_items="center"
                        )
                    ):
                        me.icon("play_arrow")
                        me.text("Apply all")
                shortcut_key = (
                    "⌘+Enter" if platform.system() == "Darwin" else "Ctrl+Enter"
                )
                me.text(
                    f"({shortcut_key})",
                    style=me.Style(
                        color="var(--md-sys-color-outline)",
                        font_size="14px",
                    ),
                )
            if s.in_progress:
                me.progress_spinner(diameter=24)


def click_apply_all(e: me.ClickEvent):
    yield from apply_all_code_changes()

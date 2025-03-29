import time
from collections.abc import Iterator
from concurrent.futures import ThreadPoolExecutor
from dataclasses import dataclass
from queue import Empty, Queue

import mesop as me
from dyad.apply_code import (
    ApplyCodeCandidate,
    CodeEdit,
    generate_apply_code_candidate,
)
from dyad.workspace_util import read_workspace_file

from dyad_app.logic.actions import register_action
from dyad_app.logic.chat_files import extract_code_blocks
from dyad_app.ui.apply_code_dialog import open_apply_code_dialog
from dyad_app.ui.state import (
    FileCodeState,
    State,
)


@me.stateclass
class ChatFilesPaneState:
    message_index: int = -1


def apply_all_code_changes() -> Iterator:
    state = me.state(State)
    # turn index is the same as message index
    turn_index = me.state(ChatFilesPaneState).message_index
    state.apply_code_state.origin.chat_id = state.current_chat.id
    state.apply_code_state.origin.turn_index = turn_index
    state.apply_code_state.origin.message_index = state.current_chat.turns[
        turn_index
    ].current_message_index

    message_content = state.current_chat.turns[
        turn_index
    ].current_message.content.get_text()
    code_blocks = extract_code_blocks(message_content)
    file_edits = [
        FileEdit(file_path=block.filepath, code_edit=block.code)
        for block in code_blocks
    ]

    yield from orchestrate_apply_code(file_edits, edit_context=message_content)


register_action("apply-code-all", lambda: apply_all_code_changes())


def process_single_file_worker(
    file_path: str,
    code_edit: str,
    edit_context: str,
    state: State,
    out_queue: Queue,
):
    """
    Worker function that processes a single file edit and pushes incremental
    updates to the out_queue.
    """
    # Build the plan for applying code edits.
    apply_code_plan = CodeEdit(
        code_edit=code_edit,
        file_path=file_path,
        edit_context=edit_context,
    )

    # If the same edit is already in progress, skip processing.
    if (
        file_path in state.apply_code_state.file_states
        and apply_code_plan
        == state.apply_code_state.file_states[file_path].plan
        and state.apply_code_state.file_states[file_path].candidate
    ):
        return

    file_code_state = FileCodeState(plan=apply_code_plan)
    state.apply_code_state.file_states[file_path] = file_code_state

    try:
        code = read_workspace_file(apply_code_plan.file_path)
    except FileNotFoundError:
        code = ""

    file_code_state.candidate = ApplyCodeCandidate(
        before_code=code,
        after_code="",
        final_code="",
        file_path=apply_code_plan.file_path,
    )

    # Send an initial update.
    out_queue.put(file_code_state)

    start_time = time.time()
    try:
        # Process the code edit and push incremental updates.
        for stream in generate_apply_code_candidate(apply_code_plan):
            file_code_state.candidate.after_code = stream
            current_time = time.time()
            # Push an update if at least 0.5 seconds have passed.
            if current_time - start_time >= 0.5:
                out_queue.put(file_code_state)
                start_time = current_time
    except Exception as e:
        file_code_state.candidate.error_message = str(e)

    # Final update after processing is complete.
    file_code_state.candidate.final_code = file_code_state.candidate.after_code
    out_queue.put(file_code_state)


@dataclass
class FileEdit:
    file_path: str
    code_edit: str


def orchestrate_apply_code(
    file_edits: list[FileEdit], edit_context: str
) -> Iterator:
    """
    Orchestrate multiple file edits concurrently using a ThreadPoolExecutor
    and a queue for incremental updates.
    """
    state = me.state(State)
    out_queue = Queue()

    with ThreadPoolExecutor(max_workers=min(len(file_edits), 5)) as executor:
        # Launch each file edit in a separate worker thread.
        futures = []
        for file_edit in file_edits:
            future = executor.submit(
                process_single_file_worker,
                file_path=file_edit.file_path,
                code_edit=file_edit.code_edit,
                edit_context=edit_context,
                state=state,
                out_queue=out_queue,
            )
            futures.append(future)

        open_apply_code_dialog()

        # Poll the queue and yield updates until all workers have completed.
        while any(not f.done() for f in futures) or not out_queue.empty():
            try:
                update = out_queue.get(timeout=0.1)
                if update:
                    yield update  # Yield update (e.g. to update the UI)
            except Empty:
                pass  # No update available right now; continue polling.

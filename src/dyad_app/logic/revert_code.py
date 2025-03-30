import mesop as me
from dyad.apply_code_entities import CodeEdit
from dyad.public.chat_message import Checkpoint
from dyad.storage.checkpoint.file_checkpoint import (
    create_candidate_from_checkpoint,
)

from dyad_app.ui.apply_code_dialog import open_apply_code_dialog
from dyad_app.ui.state import FileCodeState, State


def propose_revert_to_checkpoint(checkpoint: Checkpoint):
    me.state(State).apply_code_state.file_states.clear()
    for file in checkpoint.files:
        me.state(State).apply_code_state.file_states[file.original_path] = (
            FileCodeState(
                plan=CodeEdit(
                    code_edit="<revert from checkpoint>",
                    edit_context="<no context>",
                    file_path=file.original_path,
                ),
                candidate=create_candidate_from_checkpoint(file_revision=file),
            )
        )

    open_apply_code_dialog(checkpoint=checkpoint)

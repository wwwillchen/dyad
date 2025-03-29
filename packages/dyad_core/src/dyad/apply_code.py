import os
from collections.abc import Callable, Generator
from typing import Any

from dyad.apply_code_entities import ApplyCodeCandidate, CodeEdit
from dyad.logging.logging import logger
from dyad.public.chat_message import FileCheckpoint
from dyad.storage.checkpoint.file_checkpoint import create_checkpoint
from dyad.workspace_util import get_workspace_path

_code_edit_handler = {}


def register_code_edit_handler(
    id: str,
    handler: Callable[[CodeEdit], Generator[str, Any, Any]],
):
    _code_edit_handler[id] = handler


def generate_apply_code_candidate(
    input: CodeEdit,
) -> Generator[str, Any, Any]:
    handler = _code_edit_handler["whole-file"]
    yield from handler(input)


def apply_code(apply_code: ApplyCodeCandidate) -> FileCheckpoint:
    checkpoint = create_checkpoint(apply_code.file_path)
    file_path = get_workspace_path(apply_code.file_path)

    os.makedirs(os.path.dirname(file_path), exist_ok=True)
    with open(file_path, "w") as file:
        file.write(apply_code.final_code)

    logger().info(f"Successfully wrote changes to {file_path}")
    return checkpoint

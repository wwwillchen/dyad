import re
from collections.abc import Generator
from typing import Any

from dyad.apply_code import CodeEdit
from dyad.chat import LanguageModelRequest
from dyad.language_model.language_model_clients import (
    get_editor_language_model,
    get_language_model_client,
)
from dyad.logging.logging import logger
from dyad.public.chat_message import ErrorChunk, TextChunk
from dyad.public.input import Input
from dyad.workspace_util import (
    does_workspace_file_exist,
    read_workspace_file,
)


def remove_code_fence(text: str) -> str:
    """
    If the text appears to be entirely fenced code—determined by checking that the first
    triple-backtick occurs within the first few lines and the last within the last few lines—
    then remove only the outer fence lines from each fenced block and return the joined contents.
    Otherwise, return the text unchanged.
    """
    if "```" not in text:
        return text

    lines = text.splitlines()
    n = len(lines)
    top_threshold = 3
    bottom_threshold = 3

    # A fence is a line that, when stripped, consists solely of three backticks
    # optionally followed by an alphanumeric language identifier.
    fence_pattern = re.compile(r"^```(?:[a-zA-Z0-9]+)?\s*$")
    fence_indices = [
        i
        for i, line in enumerate(lines)
        if fence_pattern.fullmatch(line.strip())
    ]

    # If the first fence is near the top and (either there's only one fence or the last fence
    # is near the bottom), treat the text as entirely fenced code.
    if (
        fence_indices
        and fence_indices[0] < top_threshold
        and (
            len(fence_indices) == 1 or fence_indices[-1] >= n - bottom_threshold
        )
    ):
        in_block = False
        blocks = []
        current_block_lines = []
        for line in lines:
            if fence_pattern.fullmatch(line.strip()):
                in_block = not in_block
                # When closing a block, save its contents.
                if not in_block and current_block_lines:
                    blocks.append("\n".join(current_block_lines))
                    current_block_lines = []
                continue
            if in_block:
                current_block_lines.append(line)
        # In case a block wasn't properly closed, add its contents.
        if current_block_lines:
            blocks.append("\n".join(current_block_lines))
        return "\n".join(blocks)
    return text


def simple_apply_code_handler(input: CodeEdit) -> Generator[str, Any, Any]:
    if not does_workspace_file_exist(input.file_path):
        yield input.code_edit
        return

    model = get_editor_language_model()
    model_provider = get_language_model_client(
        model_id=model.id,
    )

    original_code = read_workspace_file(input.file_path)
    prompt = f"""
Given the original code:
<original-code>
{original_code}
</original-code>

Here is some context on the overall changes being made, use this to determine how to apply the edit (given later):
<context>
{input.edit_context}
</context>

OK, now apply the following edits:
<edit>
{input.code_edit}
</edit>

I want you to apply ALL the specified changes, including ALL comments and code modifications, but do NOT introduce any additional changes of your own.

* Apply every edit exactly as described
* Keep everything that's not changed *exactly* as-is, including whitespace, formatting, and comments
* Do NOT add any explanations, suggestions, or improvements
* Do NOT modify any part of the code that wasn't explicitly mentioned in the edits
* Do NOT give me anything except for the updated code

Updated code:
    """
    logger().debug("Applying code edit (whole file): %s", prompt)

    response = model_provider.stream_chunks(
        LanguageModelRequest(
            input=Input.from_text(prompt),
            prediction=original_code,
            language_model_id=model.id,
            system_prompt="FOLLOW MY INSTRUCTIONS PRECISELY.",
        )
    )
    buffer = ""

    for chunk in response:
        if isinstance(chunk, ErrorChunk):
            raise Exception(
                "Could not apply code edit because of:", chunk.message
            )
        if isinstance(chunk, TextChunk):
            buffer += chunk.text
            yield remove_code_fence(buffer)

import re
from dataclasses import dataclass
from pathlib import Path

import mesop as me
from dyad.public.chat_message import ChatMessage, Content

from dyad_app.ui.state import State


@dataclass
class CodeBlock:
    filepath: str
    code: str
    exists: bool


@dataclass
class PartialCodeBlock:
    filepath: str
    exists: bool


def has_code_blocks(text: str) -> bool:
    pattern = r'```(?:\w+)?\s+path="[^"]+"'
    return bool(re.search(pattern, text))


def extract_partial_code_blocks(text: str) -> list[PartialCodeBlock]:
    pattern = r'```(?:\w+)?\s+path="([^"]+)"'
    matches = re.finditer(pattern, text)
    result = []
    for match in matches:
        filepath = match.group(1)
        file_path = Path(filepath)
        result.append(
            PartialCodeBlock(filepath=filepath, exists=file_path.exists())
        )
    return result


def extract_code_blocks(message_content: str) -> list[CodeBlock]:
    pattern = r'```(?:\w+)?\s+path="([^"]+)"\s*\n([\s\S]*?)\n+```'
    matches = re.finditer(pattern, message_content)

    code_blocks = []
    for match in matches:
        filepath = match.group(1)
        code = match.group(2)
        file_path = Path(filepath)
        code_blocks.append(
            CodeBlock(filepath=filepath, code=code, exists=file_path.exists())
        )
    return code_blocks


def get_message(index: int) -> ChatMessage | None:
    state = me.state(State)
    if not state.current_chat or not state.current_chat.current_messages:
        return None
    return state.current_chat.current_messages[index]


def get_last_message() -> ChatMessage | None:
    state = me.state(State)
    if not state.current_chat or not state.current_chat.current_messages:
        return None
    return state.current_chat.current_messages[-1]


def get_last_message_text() -> str | None:
    last_message = get_last_message()
    if not last_message:
        return None
    return last_message.content.get_text()


def does_current_chat_have_files() -> bool:
    last_message = get_last_message_text()
    if not last_message:
        return False
    return len(extract_code_blocks(last_message)) > 0


def does_content_have_files(content: Content) -> bool:
    return len(extract_code_blocks(content.get_direct_text())) > 0

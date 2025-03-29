import re
from collections.abc import Generator

import mesop as me
from dyad import logger
from dyad.agent_api.agent import Agent, get_agent, maybe_get_agent
from dyad.agent_api.agent_context import AgentContext
from dyad.extension.extension_registry import extension_registry
from dyad.file_tree import create_file_tree
from dyad.message_cache import message_cache
from dyad.public.chat_message import (
    ChatMessage,
)
from dyad.public.input import Input
from dyad.settings.workspace_settings import get_workspace_settings
from dyad.suggestions import get_all_files
from dyad.workspace_util import read_workspace_file
from pydantic import BaseModel

from dyad_app.ui.state import State


def generate_chat_response(
    input: str,
    history: list[ChatMessage],
    model_id: str | None = None,
) -> tuple[Generator[None, None, None], AgentContext]:
    state = me.state(State)
    mention, remaining_input = detect_first_mention(input)
    context = process_input(history=history, original_input=remaining_input)
    pad_ids: set[str] = set()
    pad_ids.update(state.current_chat.pad_ids)
    pad_ids.update(get_chat_pads_from_input(remaining_input))
    context._pad_ids = pad_ids
    if model_id:
        context._language_model_ids["core"] = model_id  # pyright: ignore[reportPrivateUsage]
    agent: Agent | None = None
    if mention:
        agent = maybe_get_agent(mention.lower())
        if agent:
            workspace_settings = get_workspace_settings()
            workspace_settings.last_agent_used = mention
            workspace_settings.save()
    else:
        workspace_settings = get_workspace_settings()
        workspace_settings.last_agent_used = ""
        workspace_settings.save()

    if agent is None:
        agent = get_agent("default")
    return agent.handler(context), context


def get_chat_files(input: str) -> list[str]:
    file_paths: list[str] = []
    # Match both file: and dir: patterns
    file_pattern = r"#file:(.*?)(?:\s|$)"
    dir_pattern = r"#dir:(.*?)(?:\s|$)"

    file_matches = re.findall(file_pattern, input)
    dir_matches = re.findall(dir_pattern, input)

    # Add individual files
    for match in file_matches:
        file_path = match.strip()
        if file_path:
            file_paths.append(file_path)

    # Add all files from matched directories
    for match in dir_matches:
        dir_path = match.strip()
        if dir_path:
            # Get all files from the directory
            all_files = get_all_files()
            dir_files = [f for f in all_files if f.startswith(dir_path)]
            file_paths.extend(dir_files)

    return file_paths


def get_chat_pads_from_input(input: str) -> list[str]:
    pad_ids: list[str] = []
    pattern = r"#pad:(.*?)(?:\s|$)"
    matches = re.findall(pattern, input)

    for match in matches:
        pad_id = match.strip()
        if pad_id:
            pad_ids.append(pad_id)

    return pad_ids


def process_input(
    original_input: str, history: list[ChatMessage], no_annotation: bool = False
) -> AgentContext:
    extension_registry.wait_for_extensions_to_load()
    seen_hashtags: set[str] = set()
    file_paths: set[str] = set()

    new_input = original_input

    # Process #filetree tag
    if "#filetree" in new_input:
        new_input = replace_filetree_placeholder(new_input)
        seen_hashtags.add("#filetree")

    # Process #codebase tags
    if "#codebase-all" in new_input:
        seen_hashtags.add("#codebase-all")
    if "#codebase" in new_input:
        seen_hashtags.add("#codebase")

    # Process file and directory patterns in current input
    file_pattern = r"#file:([^\s]+)"
    dir_pattern = r"#dir:([^\s]+)"

    file_matches = re.findall(file_pattern, new_input)
    dir_matches = re.findall(dir_pattern, new_input)

    # Add individual files
    for file_path in file_matches:
        file_paths.add(file_path)

    # Add files from directories
    for dir_path in dir_matches:
        all_files = get_all_files()
        dir_files = [f for f in all_files if f.startswith(dir_path)]
        file_paths.update(dir_files)

    used_pad_ids = set()
    updated_files: dict[str, str] = {}
    for message in history:
        cached_message = message_cache().get(message.id)
        if cached_message:
            used_pad_ids.update(cached_message.pad_ids)
            for file_path in cached_message.files:
                try:
                    current_file_content = read_workspace_file(file_path)
                except Exception as e:
                    logger().debug(
                        f"Could not read cached file {file_path} (probably was deleted): {e}"
                    )
                    continue
                if current_file_content != cached_message.files[file_path]:
                    updated_files[file_path] = current_file_content

    agent_context = AgentContext(
        input=Input.from_text(new_input),
        _history=history,
        _hashtags=seen_hashtags,
        _used_pad_ids=used_pad_ids,
        _observed_files=updated_files,
    )

    if updated_files:
        agent_context.observe(
            "I have noticed the following files have changed: <changed-files>"
        )
        for file_path, file_content in updated_files.items():
            agent_context.observe(
                f"""
        ```path="{file_path}"
        {file_content}
        ```
        """
            )
        agent_context.observe("</changed-files>")

    if "#codebase-all" in seen_hashtags:
        agent_context.add_file_paths(get_all_files())
    agent_context.add_file_paths(file_paths)

    return agent_context


class File(BaseModel):
    path: str
    contents: str


def replace_filetree_placeholder(input_string: str) -> str:
    output_string = input_string.replace(
        "#filetree", "The following is the file tree structure:"
    )
    files = get_all_files()
    file_tree = create_file_tree(files)
    output_string += f"\n```\n{file_tree}\n```"
    return output_string


def read_files(
    file_paths: list[str], no_annotation: bool = False
) -> list[File]:
    files: list[File] = []
    for file_path in file_paths:
        try:
            file_contents = read_workspace_file(file_path)
            files.append(
                File(
                    path=file_path,
                    contents=file_contents,
                )
            )
        except FileNotFoundError:
            logger().warning(f"File not found: {file_path}")
        except Exception:
            logger().warning(
                f"Error processing file: {file_path} (likely with annotating it); reading it without annotations"
            )
            try:
                files.append(
                    File(
                        path=file_path,
                        contents=read_workspace_file(file_path),
                    )
                )
            except Exception:
                logger().warning(f"Error reading file: {file_path}")
    return files


def detect_first_mention(input: str) -> tuple[str | None, str]:
    # the mention must be at the beginning of the input
    # (after stripping whitespaces)
    mention_pattern = r"^\s*@([\w-]+)"
    match = re.search(mention_pattern, input.strip())
    if match:
        mention = match.group(1)
        start, end = match.span()
        remaining_input = input[:start] + input[end:]
        return mention, remaining_input.strip()
    return None, input


def process_input_with_references(
    input_text: str,
) -> str:
    """Process input text by replacing file and directory references with their contents."""
    # Process file references
    file_pattern = r"#file:([^\s]+)"
    dir_pattern = r"#dir:([^\s]+)"

    file_matches = re.findall(file_pattern, input_text)
    dir_matches = re.findall(dir_pattern, input_text)

    # Process each file reference
    for file_path in file_matches:
        try:
            file_contents = read_workspace_file(file_path)
            replacement = f"File: {file_path}\n```\n{file_contents}\n```"
            input_text = input_text.replace(f"#file:{file_path}", replacement)
        except Exception as e:
            logger().warning(f"Error processing file: {file_path}; {e!s}")

    # Process each directory reference
    for dir_path in dir_matches:
        try:
            all_files = get_all_files()
            dir_files = [f for f in all_files if f.startswith(dir_path)]

            replacement = f"Directory: {dir_path}\n"
            for file_path in dir_files:
                try:
                    file_contents = read_workspace_file(file_path)
                    replacement += (
                        f"\nFile: {file_path}\n```\n{file_contents}\n```\n"
                    )
                except Exception as e:
                    logger().warning(
                        f"Error processing file in directory: {file_path}; {e!s}"
                    )

            input_text = input_text.replace(f"#dir:{dir_path}", replacement)
        except Exception as e:
            logger().warning(f"Error processing directory: {dir_path}; {e!s}")

    if "#codebase-all" in input_text:
        for file in get_all_files():
            input_text += f"""\n```path='{file}'
            
{read_workspace_file(file)}\n"""
    return input_text

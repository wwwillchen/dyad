from collections.abc import Generator

import dyad
from dyad.agents.tools import (
    edit_codebase,
    search_codebase,
)
from dyad.prompts.prompts import get_default_system_prompt
from dyad.settings.user_settings import get_user_settings


def default_agent(
    context: dyad.AgentContext,
) -> Generator[None, None, None]:
    if get_user_settings().pad_mode == "all":
        yield from context.stream_to_content(
            system_prompt=get_default_system_prompt()
        )
        return
    if "#codebase-all" in context.hashtags:
        yield from context.stream_to_content(
            system_prompt=get_default_system_prompt()
        )
        return
    if "#codebase" in context.hashtags:
        yield from context.call_tool(
            search_codebase,
            query=context.input.text.replace("#codebase", "").strip(),
        )
        yield from context.call_tool(edit_codebase, query=context.input.text)
        return
    if context.get_file_paths():
        yield from context.call_tool(edit_codebase, query=context.input.text)
        return
    if context.history:
        yield from context.stream_to_content(
            system_prompt=get_default_system_prompt()
        )
        return
    while True:
        step = yield from context.stream_step(
            tools=[search_codebase, edit_codebase]
        )
        if step.type == "error":
            return
        if step.type == "tool_call":
            if step.is_tool(search_codebase):
                yield from context.call_tool(
                    edit_codebase,
                    query=context.input.text,
                )
                return
            if step.is_tool(edit_codebase):
                return
            continue
        if step.type == "default":
            yield from context.stream_to_content(
                system_prompt=get_default_system_prompt()
            )
            # Finish
            return


@dyad.tool(description="General software engineering expert", icon="search")
def general_software_engineering_expert(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    question: str,
):
    for chunk in context.stream_chunks(
        system_prompt=get_default_system_prompt(),
        input=question,
    ):
        output.append_chunk(chunk)
        yield

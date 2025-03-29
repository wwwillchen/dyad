from collections.abc import Generator

import dyad
from dyad.agents.tools import (
    perplexity_search_web,
)


def search_agent(
    context: dyad.AgentContext,
) -> Generator[None, None, None]:
    while True:
        step = yield from context.stream_step(tools=[perplexity_search_web])
        if step.type == "error":
            return
        if step.type == "tool_call":
            # complete after tool call
            return
        if step.type == "default":
            yield from context.stream_to_content()
            # Finish
            return

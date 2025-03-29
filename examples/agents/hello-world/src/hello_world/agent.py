from collections.abc import Generator

import dyad


def hello_world_agent(
    context: dyad.AgentContext,
) -> Generator[None, None, None]:
    while True:
        step = yield from context.stream_step(
            tools=[formal_greeting, casual_greeting]
        )
        if step.type == "error":
            return
        if step.type == "tool_call":
            # only 1 tool call and then done
            return
        if step.type == "default":
            yield from context.stream_to_content()
            # Finish
            return


@dyad.tool(description="Creates a formal greeting")
def formal_greeting(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    name: str,
):
    """Creates a polite, formal greeting. Use very formal english if the user sounds formal."""
    greeting = f"Dear {name}, I hope this message finds you well."
    for chunk in context.stream_chunks(
        input="Create a formal greeting based on this input... " + greeting,
    ):
        output.append_chunk(chunk)
        yield
    return greeting


@dyad.tool(description="Creates a casual greeting")
def casual_greeting(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    name: str,
):
    """Creates a friendly, casual greeting.

    Use this if the user sounds like they want a casual chat."""
    greeting = f"Hey {name}! 👋"

    for chunk in context.stream_chunks(
        input="Create a casual greeting based on this input... " + greeting,
    ):
        output.append_chunk(chunk)
        yield

    return greeting

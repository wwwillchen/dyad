import dyad


def haiku_agent_handler(
    context: dyad.AgentContext,
):
    yield from context.stream_to_content(
        system_prompt="You must respond with a haiku",
    )

from collections.abc import Generator

import dyad


def vanilla_agent(
    context: dyad.AgentContext,
) -> Generator[None, None, None]:
    yield from context.stream_to_content()

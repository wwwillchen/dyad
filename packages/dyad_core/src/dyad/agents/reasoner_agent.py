from collections.abc import Generator

import dyad
from dyad.prompts.prompts import CODE_OUTPUT_REQUIREMENTS


def reasoner_agent(
    context: dyad.AgentContext,
) -> Generator[None, None, None]:
    yield from context.stream_to_content(
        system_prompt=CODE_OUTPUT_REQUIREMENTS, model_type="reasoner"
    )

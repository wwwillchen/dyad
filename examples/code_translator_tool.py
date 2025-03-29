import dyad


@dyad.tool(
    description="Translates code from Python to Javascript", icon="translate"
)
def code_translator(
    context: dyad.AgentContext,
    output: dyad.Content,
    input_code: str,
):
    context.observe("Input code (Python): " + input_code)
    for chunk in context.stream_chunks(
        system_prompt="You will translate code from Python to idiomatic Javascript"
    ):
        output.append_chunk(chunk)
        yield

import dyad
from dyad.prompts.prompts import get_default_system_prompt


@dyad.tool(description="Editing codebase", icon="edit")
def edit_codebase(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    query: str,
):
    """
    When to use:
    - The user explicitly asks you to edit, modify, update, or change a specific file
    - The user asks you to create a new file in their codebase
    - The user asks you to implement a specific change in their project
    - The user wants you to fix a bug in their existing code
    - The user asks you to refactor their code

    When NOT to use:
    - The user asks a general programming question
    - The user asks for code examples or demonstrations with no intention to add them to their codebase
    - The user wants an explanation of a concept or pattern
    - The user is seeking advice on best practices
    - The user wants you to review their code without making changes
    - The user asks for pseudocode or theoretical solutions

    Flow:
    1. Confirm the file to be modified or created
    2. Get a clear understanding of the required changes
    3. If editing an existing file, fetch its current content first
    4. Make precise, minimal changes to achieve the requested outcome
    5. Provide a clear explanation of what changes were made and why

    Always confirm the user's intention before making any changes to their codebase. If in doubt, ask clarifying questions rather than using this tool prematurely.

    Example dialog:
    User: "How would I implement dependency injection in a Node.js app?"
    Assistant: [Provides explanation and examples WITHOUT using edit_codebase]

    User: "Can you update my server.js file to use dependency injection?"
    Assistant: [Uses edit_codebase to modify the actual file]
    """
    if query.startswith("#file:"):
        query = query[len("#file:") :].split(" ")[0]
        context.observe(
            "I want you to focus on editing the following file: " + query
        )
        context.observe_file_paths([query])

    for chunk in context.stream_chunks(
        system_prompt=get_default_system_prompt()
    ):
        output.append_chunk(chunk)
        yield

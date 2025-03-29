import functools

import mesop as me
from pydantic import BaseModel

import dyad
from dyad.workspace_util import read_workspace_file

NEW_LINE = "\n"


class CodeSearchResultStage(BaseModel):
    title: str
    file_paths: list[str]


class CodeSearchResult(BaseModel):
    stages: list[CodeSearchResultStage]
    is_complete: bool = False


def render_code_search(content: dyad.Content):
    code_search_result = content.data_of(CodeSearchResult)
    for stage in code_search_result.stages:
        referenced_file_box(stage)
    if not code_search_result.is_complete:
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="column",
                gap=8,
                margin=me.Margin(top=12),
            )
        ):
            me.text(
                "Deciding which files are relevant...",
                style=me.Style(
                    font_size=15  # , color=me.theme_var("on-surface-variant")
                ),
            )
            me.progress_spinner(diameter=24)


def referenced_file_box(stage: CodeSearchResultStage):
    def handle_file_click(e: me.ClickEvent, path: str):
        dyad.open_code_pane(path)

    me.text(
        stage.title + " (" + str(len(stage.file_paths)) + " files)",
        style=me.Style(
            font_weight=500, font_size=16, margin=me.Margin(bottom=8, top=16)
        ),
    )
    file_refs = stage.file_paths
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="row",
            flex_wrap="wrap",
            gap=12,
        )
    ):
        for file_ref in file_refs:
            path_parts = file_ref.split("/")
            filename = path_parts[-1]
            directory = "/".join(path_parts[:-1]) if len(path_parts) > 1 else ""

            with me.tooltip(message=file_ref):
                with me.box(
                    style=me.Style(
                        display="inline-flex",
                        flex_direction="row",
                        align_items="center",
                        background=me.theme_var("surface-container-low"),
                        padding=me.Padding.all(4),
                        border_radius=8,
                        gap=4,
                        cursor="pointer",
                        overflow="hidden",
                    ),
                    on_click=functools.partial(
                        handle_file_click, path=file_ref
                    ),
                ):
                    with me.box(style=me.Style(flex_shrink=0)):
                        me.icon(
                            "description",
                        )
                    with me.box(
                        style=me.Style(
                            display="flex",
                            align_items="start",
                            flex_direction="column",
                        )
                    ):
                        me.text(
                            filename,
                            style=me.Style(
                                font_weight=500,
                                font_size=14,
                                white_space="nowrap",
                                overflow="hidden",
                                text_overflow="ellipsis",
                                width=190,
                            ),
                        )
                        if directory:
                            me.text(
                                directory,
                                style=me.Style(
                                    font_size=12,
                                    color=me.theme_var("on-surface-variant"),
                                    white_space="nowrap",
                                    overflow="hidden",
                                    text_overflow="ellipsis",
                                    width=190,
                                ),
                            )


def is_code_search_supported():
    return dyad.is_semantic_search_enabled()


@dyad.tool(
    description="Searching codebase",
    icon="search",
    render=render_code_search,
    is_available=is_code_search_supported,
)
def search_codebase(
    context: dyad.AgentContext,
    output: dyad.Content,
    query: str,
):
    """
    The `search_codebase` tool allows you to search through a codebase to find relevant files, functions, classes, and code snippets based on natural language queries. This tool helps you understand unfamiliar code, identify relevant parts of a large codebase, and find examples or implementations.

    ## When to Use the Search Codebase Tool

    ### Use the tool when:

    1. **Understanding unfamiliar code**
       - When asked about how a specific feature is implemented
       - When needing to understand the architecture of a codebase
       - When trying to locate where certain functionality exists

    2. **Diagnosing issues**
       - When troubleshooting bugs or errors
       - When finding the source of unexpected behavior
       - When determining which components might be affected by a change

    3. **Implementation guidance**
       - When finding examples of similar implementations
       - When determining best practices used within the codebase
       - When looking for patterns to follow for new code

    4. **Code navigation requests**
       - When asked to find specific files, classes, or functions
       - When needing to understand dependencies between components
       - When analyzing the import/export structure of a project

    5. **Documentation needs**
       - When looking for comments or documentation within code
       - When trying to understand the purpose of specific functions
       - When gathering information to create documentation

    ### Do NOT use the tool when:

    1. **Simple coding questions unrelated to the specific codebase**
       - General programming language questions
       - Theoretical computer science concepts
       - Algorithm explanations unrelated to implementation

    2. **Non-code requests**
       - General conversation
       - Personal advice
       - Non-programming topics

    ## Usage Guidelines

    1. **Be specific in your queries**
       - Instead of "search for authentication", use "search for user authentication function in the backend"
       - Include expected file types, function names, or specific terminology

    2. **Start broad, then narrow**
       - Begin with broader searches to understand the codebase structure
       - Follow up with more specific searches based on initial findings

    3. **Use the codebase's terminology**
       - Adopt the naming conventions and terms used in the codebase
       - Reference specific class names, function names, or variables when known
    """
    result = CodeSearchResult(stages=[])
    output.set_data(result)
    search_results = []
    try:
        search_results = list(dyad.semantic_search(query=query, limit=10))
        result.stages.append(
            CodeSearchResultStage(
                title="Semantically similar files", file_paths=search_results
            )
        )

    except Exception as e:
        output.append_chunk(
            chunk=dyad.TextChunk(
                text="Error performing semantic search: " + str(e)
            )
        )
        dyad.logger().warning(f"Error performing semantic search: {e!s}")
    finally:
        yield

    # Filter these results based on an LLM call
    relevant_files = None
    for relevant_files in context.stream_structured_output(  # noqa: B007
        RelevantFiles,
        input=f"""
Based on the following user input:
<input>
{context.input.text}
</input>

Tell me which of the following files are relevant to the user query:
<files>
{NEW_LINE.join([format_search_result(search_result) for search_result in search_results])}
</files>

Return me the list of file paths that are relevant to the user query.
    """,
    ):
        pass
    assert relevant_files is not None
    result.stages.append(
        CodeSearchResultStage(
            title="LLM filtered files",
            file_paths=relevant_files.file_paths,
        )
    )

    step_content = "\n\nThese are relevant files from the codebase:\n"
    context.observe_file_paths(relevant_files.file_paths)
    for file_path in search_results:
        step_content += f"- {file_path}\n"
    context.observe(step_content)
    result.is_complete = True
    yield


class RelevantFiles(BaseModel):
    file_paths: list[str]


def format_search_result(search_result: str):
    try:
        workspace_content = read_workspace_file(search_result)
    except Exception as e:
        dyad.logger().warning(
            f"Error reading workspace file {search_result}: {e!s}"
        )
    return ""
    return f"""
<file path="{search_result}">
{workspace_content}
</file>
"""

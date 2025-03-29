import dyad
from dyad.public.part import TextPart

from dyad_github.pr_fetcher import fetch_pr_contents
from dyad_github.pr_parser import extract_github_pr_url
from dyad_github.prompt import CODE_REVIEWER_PROMPT


def github_agent(context: dyad.AgentContext):
    content = dyad.Content()
    context.content.add_child(content)

    pr_urls = extract_github_pr_url(context.input.text)
    content.append_chunk(
        dyad.TextChunk(
            text="Fetching PRs from the message: " + str(pr_urls) + "\n"
        )
    )
    yield

    if not pr_urls:
        content.set_text("No PRs found in the message.")
        yield
        return
    if len(pr_urls) > 1:
        content.set_text("Multiple PRs found in the message.")
        yield
        return
    pr_contents = fetch_pr_contents(pr_urls[0])
    content.append_chunk(
        dyad.TextChunk(
            text="Fetched PR contents: " + str(len(pr_contents)) + "\n"
        )
    )
    yield
    context.input.parts.append(TextPart(text="\n" + pr_contents))
    for chunk in context.stream_chunks(
        system_prompt=CODE_REVIEWER_PROMPT,
        model_type="reasoner",
    ):
        content.append_chunk(chunk)
        yield

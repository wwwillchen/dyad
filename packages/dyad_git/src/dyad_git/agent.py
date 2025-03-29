import re
import time
from collections.abc import Generator

import dyad
import mesop as me
from git import GitCommandError, Repo
from pydantic import BaseModel


@dyad.tool(
    description="Provides the differences between the current state and a specified Git commit."
)
def git_diff(
    context: dyad.AgentContext, output: dyad.Content, *, commit: str = "HEAD"
) -> Generator[None, None, None]:
    """
    Provides the differences between the current state and a specified Git commit.

    Args:
        commit (str): The Git commit to compare against. Default is "HEAD".
    """
    try:
        repo = Repo(dyad.get_workspace_path())
        diff = repo.git.diff(commit, unified=9999)  # Show full file context
        output.append_chunk(
            dyad.TextChunk(text="```\n" + diff[:1000] + "\n```")
        )
    except GitCommandError as e:
        output.append_chunk(dyad.ErrorChunk(message=str(e)))
    yield


CODE_REVIEW_SYSTEM_PROMPT = """
You are a code review assistant that focuses exclusively on critical issues. When given a git diff, analyze the changes and identify only the most important problems that could impact:

1. Correctness: Logic errors, race conditions, edge cases that could cause crashes
2. Security: Vulnerabilities like SQL injection, XSS, CSRF, unsafe deserialization
3. Severe Performance: O(n²) where O(n) is possible, memory leaks, unnecessary DB queries

DO NOT MENTION:
- Style issues (formatting, naming)
- Minor optimizations
- Documentation
- Test coverage
- Any issue that doesn't pose a significant risk

For each critical issue found, format the output as:

<issue>
<title>Brief, specific title describing the problem</title>
<severity>High|Medium|Low</severity>
<description>
* Clear explanation of the problem and its impact
* Specific, actionable fix suggestion
* Example diff showing the problematic code and proposed solution:

</description>
</issue>

IF THERE ARE CRITICAL ISSUES, then provide the improved version of each modified file in one code block
(for code that's the same just leave a comment that says keep code the same).
If there are NO issues for a file, then do NOT output a code block for it.

IF THERE ARE NO CRITICAL ISSUES, then just skip the code block and provide a summary of the review.

Guidelines for severity levels:
- High: Could lead to system compromise, data loss, or crashes in production
- Medium: Significant impact on functionality or performance but not immediately critical
- Low: Important to fix but unlikely to cause immediate problems

Remember:
- Focus on substance over form
- Only flag issues that truly matter
- Provide concrete, actionable feedback
- Show exactly how to fix each issue

- Include the path to the file in the code block. For example:

```python path="foo/bar.py"
print("hello")
```

```javascript path="foo/bar.js"
console.log("hello");
```
"""


class CodeReviewIssue(BaseModel):
    title: str
    severity: str
    description: str


class CodeReview(BaseModel):
    beginning: str
    issues: list[CodeReviewIssue]
    ending: str


def render_code_review(output: dyad.Content):
    data = output.data_of(CodeReview)
    dyad.markdown(data.beginning)
    if data.issues:
        me.text(
            "Code Review Issues",
            style=me.Style(
                font_size=20,
                font_weight=500,
                padding=me.Padding(top=16, bottom=12),
            ),
        )
    with me.accordion():
        for issue in data.issues:
            with me.expansion_panel(
                title=issue.title + f" (Severity: {issue.severity})"
            ):
                dyad.markdown(issue.description)
    if data.ending:
        me.text(
            "Summary",
            style=me.Style(
                font_size=20, font_weight=500, padding=me.Padding(top=16)
            ),
        )
        dyad.markdown(data.ending)


@dyad.tool(description="Code review", render=render_code_review)
def git_review(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    commit: str | None = None,
) -> Generator[None, None, None]:
    """
    Provides a code review for a specified Git commit.

    If no commit is specified, the code review will be generated for the current state.
    """
    try:
        repo = Repo(dyad.get_workspace_path())
        if commit is None:
            commit = "HEAD"
            commit_info = repo.commit(commit)
            review_diff = repo.git.diff(commit_info, unified=9999)
        else:
            commit_info = repo.commit(commit)
            review_diff = repo.git.diff(
                commit_info.parents[0], commit_info, unified=9999
            )
        acc = ""
        start_time = time.time()
        for chunk in context.stream_chunks(
            input=review_diff,
            system_prompt=CODE_REVIEW_SYSTEM_PROMPT,
            model_type="reasoner",
        ):
            if isinstance(chunk, dyad.ErrorChunk):
                output.append_chunk(chunk)
                return
            acc += chunk.text
            if time.time() - start_time > 0.50:
                output.set_data(parse_code_review(acc))
                yield
    except GitCommandError as e:
        output.append_chunk(dyad.ErrorChunk(message=str(e)))
    yield


def parse_code_review(review_diff: str) -> CodeReview:
    issues = []
    issue_pattern = re.compile(r"<issue>(.*?)</issue>", re.DOTALL)
    title_pattern = re.compile(r"<title>(.*?)</title>", re.DOTALL)
    severity_pattern = re.compile(r"<severity>(.*?)</severity>", re.DOTALL)
    description_pattern = re.compile(
        r"<description>(.*?)</description>", re.DOTALL
    )

    issue_blocks = list(issue_pattern.finditer(review_diff))
    for issue_match in issue_blocks:
        block = issue_match.group(1)
        title_match = title_pattern.search(block)
        severity_match = severity_pattern.search(block)
        description_match = description_pattern.search(block)
        title = title_match.group(1).strip() if title_match else ""
        severity = severity_match.group(1).strip() if severity_match else ""
        description = (
            description_match.group(1).strip() if description_match else ""
        )
        issues.append(
            CodeReviewIssue(
                title=title, severity=severity, description=description
            )
        )

    if issue_blocks:
        beginning = review_diff[: issue_blocks[0].start()].strip()
        ending = review_diff[issue_blocks[-1].end() :].strip()
    else:
        beginning = review_diff.strip()
        ending = ""

    return CodeReview(beginning=beginning, issues=issues, ending=ending)


def git_agent(context: dyad.AgentContext):
    input_text = context.input.text.strip()
    words = input_text.split()

    if input_text == "review":
        yield from context.call_tool(git_review)
        return
    elif len(words) == 2 and words[0] == "review":
        commit = words[1]
        yield from context.call_tool(git_review, commit=commit)
        return

    if input_text == "diff":
        yield from context.call_tool(git_diff)
        return
    elif len(words) == 2 and words[0] == "diff":
        commit = words[1]
        yield from context.call_tool(git_diff, commit=commit)
        return

    while True:
        step = yield from context.stream_step()
        if step.type == "error":
            return
        if step.type == "tool_call":
            # only 1 tool call and then done
            return
        if step.type == "default":
            yield from context.stream_to_content(
                system_prompt="I AM A GIT EXPERT"
            )
            return

import functools
import re
from urllib.parse import urlparse

import mesop as me
import requests
from pydantic import BaseModel

import dyad
from dyad.agents.tools.perplexity_api import chat_with_search


class Citation(BaseModel):
    url: str
    title: str
    domain: str


class WebContent(BaseModel):
    content: str
    citations: list[Citation]


def render_web_content(content: dyad.Content):
    web_content = content.data_of(WebContent)
    citations_box(web_content.citations)
    me.markdown(web_content.content)


def citations_box(citations: list[Citation]):
    with me.box(
        style=me.Style(
            display="flex", flex_direction="row", flex_wrap="wrap", gap=8
        )
    ):
        for citation in citations:
            citation_box(citation)


@functools.lru_cache(maxsize=200)
def get_site_title(citation: str) -> str:
    # do an http request to get the title
    url = citation
    response = requests.get(url)
    html_content = response.content.decode("utf-8")
    title_pattern = re.compile(r"<title>(.*?)</title>")
    match = title_pattern.search(html_content)
    if match:
        title = match.group(1)
        return title
    else:
        return "Untitled site"


def open_url(e: me.ClickEvent, url: str):
    me.navigate(url)


def citation_box(citation: Citation):
    with me.tooltip(message=citation.url):
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="column",
                justify_content="space-between",
                gap=8,
                background=me.theme_var("surface-container-low"),
                padding=me.Padding.all(8),
                border_radius=12,
                width=140,
                height=90,
                cursor="pointer",
            ),
            classes="hover-surface-container-high",
            on_click=functools.partial(open_url, url=citation.url),
        ):
            with me.box(classes="two-lines"):
                me.text(
                    citation.title[:40] + "...",
                    style=me.Style(font_size=14),
                )
            with me.box(
                style=me.Style(display="flex", flex_direction="row", gap=8)
            ):
                me.image(
                    src=f"https://www.google.com/s2/favicons?sz=128&domain={citation.domain}",
                    style=me.Style(width=16, height=16),
                )
                me.text(
                    citation.domain,
                    style=me.Style(
                        font_size=13,
                        overflow="hidden",
                        text_overflow="ellipsis",
                        white_space="nowrap",
                    ),
                )


def get_domain(url: str) -> str:
    domain = urlparse(url).netloc
    site = domain
    if domain.startswith("www."):
        site = domain[4:]
    return site


def is_available():
    return dyad.is_provider_setup("perplexity")


@dyad.tool(
    description="Searching the web",
    icon="web",
    render=render_web_content,
    is_available=is_available,
)
def perplexity_search_web(
    context: dyad.AgentContext,
    output: dyad.Content,
    *,
    query: str,
):
    """
    Search the web for information.

    *ONLY* use this tool if you need up-to-date information.
    """
    acc = ""
    citations: set[str] = set()
    context.observe(
        "Searching the web for information using the query: " + query,
    )
    for chunk in chat_with_search(query):
        acc += chunk.content
        for citation in chunk.citations:
            citations.add(citation)

        citations_list: list[Citation] = []
        for citation in citations:
            citations_list.append(
                Citation(
                    url=citation,
                    title=get_site_title(citation),
                    domain=get_domain(citation),
                )
            )
        output.set_data(WebContent(content=acc, citations=citations_list))
        yield
    context.observe(
        "Search results: " + acc,
    )
    yield

import re
from dataclasses import dataclass

from dyad.pad import Pad


@dataclass
class TextContent:
    text: str


@dataclass
class FollowUpPrompts:
    prompts: list[str]


@dataclass
class AcademyCollection:
    collection_id: str


# Update ParsedSegment to be a Union of all possible types
ParsedSegment = TextContent | FollowUpPrompts | Pad | AcademyCollection


@dataclass
class ContentWithPad:
    segments: list[ParsedSegment]

    def get_academy_collection_id(self) -> str | None:
        for segment in self.segments:
            if isinstance(segment, AcademyCollection):
                return segment.collection_id
        return None

    def has_pad(self) -> bool:
        return any(isinstance(segment, Pad) for segment in self.segments)

    def get_first_pad(self) -> Pad:
        for segment in self.segments:
            if isinstance(segment, Pad):
                return segment
        raise ValueError("No pad found in content")


def parse_text_segment(text: str) -> list[ParsedSegment]:
    """Parse a text segment into its components."""
    segments: list[ParsedSegment] = []

    if not text.strip():
        return segments

    # Parse collection ID if it exists
    collection_match = re.search(
        r"<dyad-collection-id>(.*?)</dyad-collection-id>", text
    )
    if collection_match:
        collection_id = collection_match.group(1)
        segments.append(AcademyCollection(collection_id=collection_id))
        # Remove the collection-id tags and content from the text
        text = re.sub(r"<dyad-collection-id>.*?</dyad-collection-id>", "", text)

    # Find follow-up prompts if they exist
    follow_up_match = re.search(
        r"<dyad-prompts>(.*?)</dyad-prompts>", text, re.DOTALL
    )
    if follow_up_match:
        # Get the text before follow-up prompts
        pre_text = text[: follow_up_match.start()].strip()
        if pre_text:
            segments.append(TextContent(text=pre_text))

        # Parse the follow-up prompts
        prompts_text = follow_up_match.group(1)
        prompts = [
            line.lstrip("- ")
            for line in prompts_text.split("\n")
            if line.strip()
        ]
        if prompts:
            segments.append(FollowUpPrompts(prompts=prompts))

        # Get the text after follow-up prompts
        post_text = text[follow_up_match.end() :].strip()
        if post_text:
            segments.append(TextContent(text=post_text))
    else:
        # No follow-up prompts, just regular text
        if text.strip():
            segments.append(TextContent(text=text.strip()))

    return segments


def parse_content_with_pad(content: str) -> ContentWithPad:
    """
    Parses the given content and returns a ContentWithPad object whose segments
    list contains TextContent, FollowUpPrompts, Pad, or AcademyCollection objects.
    """
    segments: list[ParsedSegment] = []
    # Regex to match a complete dyad-pad element (with closing tag).
    complete_pattern = re.compile(
        r'(?s)<dyad-pad\s+title="(.*?)"\s*(?:type="(.*?)")?\s*(?:id="(.*?)")?\s*>(.*?)</dyad-pad>'
    )
    last_index = 0

    # Process complete dyad-pad elements
    for match in complete_pattern.finditer(content):
        # Add any text that precedes the dyad-pad element
        if match.start() > last_index:
            segments.extend(
                parse_text_segment(content[last_index : match.start()])
            )

        title = match.group(1)
        pad_type = (
            match.group(2) or "text/markdown"
        )  # Default to markdown if type not specified
        pad_id = (
            match.group(3) or "<unset>"
        )  # Default to unset if id not specified
        dyad_content = match.group(4)
        segments.append(
            Pad(
                title=title,
                content=dyad_content,
                complete=True,
                id=pad_id,
                type=pad_type,
            )
        )
        last_index = match.end()

    # Handle remaining text
    remaining = content[last_index:]
    if remaining:
        opening_match = re.search(
            r'<dyad-pad\s+title="(.*?)"\s*(?:type="(.*?)")?\s*(?:id="(.*?)")?\s*>',
            remaining,
        )
        if opening_match:
            # Process text before the opening tag
            text_before = remaining[: opening_match.start()]
            if text_before.strip():
                segments.extend(parse_text_segment(text_before))

            title = opening_match.group(1)
            pad_type = (
                opening_match.group(2) or "text/markdown"
            )  # Default to markdown if type not specified
            pad_id = (
                opening_match.group(3) or "<unset>"
            )  # Default to unset if id not specified
            pad_content = remaining[opening_match.end() :]
            segments.append(
                Pad(
                    title=title,
                    content=pad_content,
                    complete=False,
                    id=pad_id,
                    type=pad_type,
                )
            )
        else:
            # No incomplete pad found; parse as regular text
            segments.extend(parse_text_segment(remaining))

    return ContentWithPad(segments=segments)

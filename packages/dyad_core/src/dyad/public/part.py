from os import PathLike
from typing import IO, Annotated, Literal

from pydantic import BaseModel, Field


class TextPart(BaseModel):
    type: Literal["text"] = "text"
    text: str

    class Config:
        frozen = True


Base64FileInput = IO[bytes] | PathLike[str]


class Base64Source:
    type: Literal["base64"] = "base64"
    media_type: Literal["image/jpeg", "image/png", "image/gif", "image/webp"]
    data: str | Base64FileInput


class UrlSource:
    type: Literal["url"] = "url"
    url: str


Source = Annotated[UrlSource | Base64Source, Field(discriminator="type")]


class ImagePart(BaseModel):
    type: Literal["image"] = "image"
    # source: Source

    class Config:
        frozen = True


Part = Annotated[TextPart | ImagePart, Field(discriminator="type")]

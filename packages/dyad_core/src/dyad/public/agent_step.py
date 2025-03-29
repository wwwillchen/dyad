from collections.abc import Callable, Generator
from typing import (
    Annotated,
    Any,
    Literal,
)

from pydantic import BaseModel, Field

ToolHandler = Callable[
    ...,
    Generator[None, None, Any],
]  # using a simple type def to avoid dependencies


class ToolId(BaseModel):
    package_name: str
    tool_name: str

    class Config:
        frozen = True


class ToolCallStep(BaseModel):
    type: Literal["tool_call"] = "tool_call"
    args: dict[str, Any] = Field(default_factory=dict)
    tool_id: ToolId
    rationale: str = ""
    return_value: Any | None = None

    def is_tool(self, tool_handler: ToolHandler) -> bool:
        if _get_tool_from_handler is None:
            raise ValueError("get_tool_from_handler must be set")
        return self.tool_id == _get_tool_from_handler(tool_handler).id


class DefaultStep(BaseModel):
    type: Literal["default"] = "default"


class ErrorStep(BaseModel):
    type: Literal["error"] = "error"
    error_message: str


AgentStep = Annotated[
    ToolCallStep | DefaultStep | ErrorStep, Field(discriminator="type")
]

_get_tool_from_handler = None


def set_get_tool_from_handler(get_tool_from_handler: Callable) -> None:
    global _get_tool_from_handler
    _get_tool_from_handler = get_tool_from_handler

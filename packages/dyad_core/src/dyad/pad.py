from typing import Annotated, Literal

from pydantic import BaseModel, Field


class GlobSelectionCriteria(BaseModel):
    type: Literal["glob"]
    glob_pattern: str


class SelectionInstructionCriteria(BaseModel):
    type: Literal["selection_instruction"]
    selection_instruction: str


SelectionCriteria = Annotated[
    GlobSelectionCriteria | SelectionInstructionCriteria,
    Field(discriminator="type"),
]


class Pad(BaseModel):
    title: str
    content: str
    complete: bool
    id: str
    type: str
    file_path: str | None = None
    selection_criteria: SelectionCriteria | None = None

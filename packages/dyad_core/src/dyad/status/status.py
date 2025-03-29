from dataclasses import dataclass
from typing import Literal


@dataclass
class Status:
    text: str = ""
    in_progress: bool = False
    type: Literal["extension", "indexing", "other"] = "other"

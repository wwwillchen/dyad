from typing import Literal

from pydantic import BaseModel


class FileUpdate(BaseModel):
    type: Literal["edit", "delete"]
    file_path: str
    modified_timestamp: float

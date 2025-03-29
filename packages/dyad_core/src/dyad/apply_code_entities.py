from dataclasses import dataclass


@dataclass
class CodeEdit:
    edit_context: str
    code_edit: str
    file_path: str


@dataclass
class ApplyCodeCandidate:
    before_code: str
    after_code: str
    final_code: str
    file_path: str
    error_message: str | None = None

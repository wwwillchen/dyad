from dataclasses import dataclass

from dyad.public.part import Part, TextPart


@dataclass
class Input:
    @staticmethod
    def from_text(text: str) -> "Input":
        return Input(parts=[TextPart(text=text)])

    parts: list[Part]

    @property
    def text(self) -> str:
        return "".join(part.text for part in self.parts if part.type == "text")

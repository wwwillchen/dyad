from pydantic import BaseModel


class EmbedderId(BaseModel):
    """Embedder ID."""

    provider: str
    model: str
    dim: int

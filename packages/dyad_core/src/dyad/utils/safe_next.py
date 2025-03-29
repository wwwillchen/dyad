from collections.abc import Iterator
from typing import TypeVar

T = TypeVar("T")  # Generic type for iterator elements


def safe_next(
    iterator: Iterator[T], message: str = "Iterator is exhausted"
) -> T:
    """
    Safely get the next item from an iterator, converting StopIteration to RuntimeError.

    Args:
        iterator: Any iterator object
        message: Optional custom error message (default: "Iterator is exhausted")

    Returns:
        The next item from the iterator

    Raises:
        RuntimeError: If the iterator is exhausted
    """
    try:
        return next(iterator)
    except StopIteration as e:
        raise RuntimeError(message) from e

from datetime import datetime, timedelta

from pydantic import BaseModel, Field


class CachedUserMessage(BaseModel):
    """Model representing a cached user message."""

    language_model_text: str
    pad_ids: set[str] = Field(default_factory=set)
    created_timestamp: datetime = Field(default_factory=datetime.now)
    files: dict[str, str] = Field(default_factory=dict)


class MessageCache:
    """
    A simple in-memory cache for user messages with automatic purging of old entries.
    Entries older than 50 minutes are automatically removed when accessing the cache.
    """

    def __init__(self):
        self._cache: dict[str, CachedUserMessage] = {}
        self._max_age = timedelta(minutes=50)

    def get(self, key: str) -> CachedUserMessage | None:
        """
        Retrieve a cached message by key.
        Returns None if the key doesn't exist or if the entry is too old.
        """
        self._purge_old_entries()
        return self._cache.get(key)

    def set(
        self,
        *,
        key: str,
        language_model_text: str,
        pad_ids: set[str] | None = None,
        files: dict[str, str] | None = None,
    ) -> CachedUserMessage:
        """
        Store a message in the cache.
        Returns the created CachedUserMessage object.
        """
        cached_message = CachedUserMessage(
            language_model_text=language_model_text,
            pad_ids=pad_ids or set(),
            files=files or {},
            created_timestamp=datetime.now(),
        )
        self._cache[key] = cached_message
        return cached_message

    def _purge_old_entries(self) -> None:
        """
        Remove entries that are older than the maximum age (10 minutes).
        """
        now = datetime.now()
        keys_to_delete = [
            key
            for key, message in self._cache.items()
            if now - message.created_timestamp > self._max_age
        ]

        for key in keys_to_delete:
            del self._cache[key]

    def clear(self) -> None:
        """Clear all entries from the cache."""
        self._cache.clear()


_message_cache = MessageCache()


def message_cache() -> MessageCache:
    """Get the global message cache instance."""
    return _message_cache

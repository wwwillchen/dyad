from dataclasses import dataclass, field
from threading import Lock

from dyad.status.status import Status


@dataclass
class StatusTracker:
    _status_by_type: dict[str, Status] = field(default_factory=dict)
    _lock: Lock = field(default_factory=Lock, init=False)

    def enqueue(self, status: Status):
        """Updates the status for the given type."""
        with self._lock:
            self._status_by_type[status.type] = status

    def get_statuses(self) -> dict[str, Status]:
        """Returns a copy of the current status dictionary."""
        with self._lock:
            return self._status_by_type.copy()

    def clear(self):
        """Clears all statuses."""
        with self._lock:
            self._status_by_type.clear()

    def remove(self, type: str):
        """Removes the status for the given type."""
        with self._lock:
            if type in self._status_by_type:
                del self._status_by_type[type]


_status_tracker = StatusTracker()


def status_tracker():
    return _status_tracker

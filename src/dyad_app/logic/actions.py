from collections.abc import Callable
from typing import Any, Literal

_action_callbacks: dict[str, Callable[[], Any]] = {}


ActionName = Literal[
    "apply-code-all", "apply-code-confirm", "reload-extensions"
]


def register_action(
    action_name: ActionName, callback: Callable[[], Any]
) -> None:
    """
    Register a callback function for a specific action.

    Args:
        action_name: The name of the action to register
        callback: The callback function to execute when the action is called
    """
    _action_callbacks[action_name] = callback


def call_action(action_name: ActionName) -> Any:
    """
    Call the registered callback function for a specific action.

    Args:
        action_name: The name of the action to execute

    Raises:
        ValueError: If no callback is registered for the given action name

    Returns:
        The result of the callback function
    """
    if action_name in _action_callbacks:
        return _action_callbacks[action_name]()
    else:
        raise ValueError(f"No callback registered for action: {action_name}")

import hashlib
from collections.abc import Callable
from functools import wraps
from typing import Any, ParamSpec, TypeVar, cast

import mesop.protos.ui_pb2 as pb
from mesop.exceptions import MesopDeveloperException
from mesop.runtime import runtime
from mesop.runtime.context import NodeTreeState

P = ParamSpec("P")
# The return type is always None.
R = TypeVar("R", bound=None)


def _compute_cache_key(args: tuple[Any, ...], kwargs: dict[str, Any]) -> str:
    """
    Computes a SHA-256 hash based on the component function's arguments.

    The key is generated from a tuple containing the positional arguments
    and a sorted tuple of keyword items.
    """
    try:
        key_data = (args, tuple(sorted(kwargs.items())))
        key_str = repr(key_data)
    except Exception as e:
        raise MesopDeveloperException(
            f"Failed to compute cache key for pure_component: {e}"
        ) from e
    return hashlib.sha256(key_str.encode("utf-8")).hexdigest()


def _replay_cached_state(
    cached_state: NodeTreeState, parent_node: pb.Component
) -> None:
    """
    Replays the cached node tree state by copying each child from the cached state's
    current node into the given parent node.
    """
    for child in cached_state.current_node().children:
        new_child = parent_node.children.add()
        new_child.CopyFrom(child)


def pure_component(fn: Callable[P, None]) -> Callable[P, None]:
    """
    Decorator for pure components that caches their rendered node tree state based on function arguments.

    The decorated component function must return None. When called:
      - A cache key is computed from its arguments.
      - If a cached state exists, its children are replayed in the current node.
      - Otherwise, a new NodeTreeState is created, the function is executed, and the resulting
        node tree state is cached for future calls.
    """
    # cache: Dict[str, NodeTreeState] = {}

    @wraps(fn)
    def wrapper(*args: P.args, **kwargs: P.kwargs) -> None:
        key_hash = _compute_cache_key(args, kwargs)
        parent_node = runtime().context().current_node()
        if not hasattr(runtime().context(), "pure_component_cache"):
            runtime().context().pure_component_cache = {}  # type: ignore
        cache = cast(
            dict[str, NodeTreeState],
            runtime().context().pure_component_cache,  # type: ignore
        )

        if key_hash in cache:
            _replay_cached_state(cache[key_hash], parent_node)
            return

        # Create a fresh NodeTreeState to capture the side effects of rendering.
        original_state = runtime().context().get_node_tree_state()
        node_tree_state = NodeTreeState()
        runtime().context().set_node_tree_state(node_tree_state)

        # Execute the component function (it should render to the new node tree state).
        fn(*args, **kwargs)

        # Restore the original node tree state.
        runtime().context().set_node_tree_state(original_state)
        _replay_cached_state(node_tree_state, parent_node)

        # Cache a deep copy of the new node tree state for future reuse.
        cache[key_hash] = node_tree_state

    return wrapper

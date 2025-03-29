import time
from collections.abc import Callable, Generator
from dataclasses import dataclass
from typing import Any, Literal

import mesop as me


@me.component
def snackbar(
    *,
    is_visible: bool,
    label: str,
    on_click_close: Callable[[me.ClickEvent], Any],
    action_label: str | None = None,
    on_click_action: Callable[[me.ClickEvent], Any] | None = None,
    horizontal_position: Literal["start", "center", "end"] = "center",
    vertical_position: Literal["start", "center", "end"] = "end",
):
    """Creates a snackbar.

    Args:
      is_visible: Whether the snackbar is currently visible or not.
      label: Message for the snackbar
      action_label: Optional message for the action of the snackbar
      on_click_action: Optional click event when action is triggered.
      horizontal_position: Horizontal position of the snackbar
      vertical_position: Vertical position of the snackbar
    """
    with me.box(
        style=me.Style(
            display="block" if is_visible else "none",
            height="100%",
            overflow_x="auto",
            overflow_y="auto",
            position="fixed",
            pointer_events="none",
            width="100%",
            z_index=1000,
        )
    ):
        with me.box(
            style=me.Style(
                align_items=vertical_position,
                height="100%",
                display="flex",
                justify_content=horizontal_position,
            )
        ):
            with me.box(
                style=me.Style(
                    align_items="center",
                    background=me.theme_var("on-surface-variant"),
                    border_radius=5,
                    box_shadow=(
                        "0 3px 1px -2px #0003, 0 2px 2px #00000024, 0 1px 5px #0000001f"
                    ),
                    display="flex",
                    font_size=14,
                    justify_content="space-between",
                    margin=me.Margin.all(12),
                    padding=me.Padding.symmetric(horizontal=8, vertical=4),
                    pointer_events="auto",
                    max_width=400,
                    min_width=300,
                )
            ):
                with me.content_button(
                    type="icon",
                    on_click=on_click_close,
                ):
                    me.icon(
                        "close",
                        style=me.Style(color=me.theme_var("surface-container")),
                    )
                me.text(
                    label,
                    style=me.Style(
                        color=me.theme_var("surface-container-lowest")
                    ),
                )
                if action_label:
                    me.button(
                        action_label,
                        on_click=on_click_action,
                        style=me.Style(color=me.theme_var("primary-container")),
                    )
                else:
                    # for spacing
                    me.box()


@dataclass
class SnackbarConfig:
    """Configuration for creating a snackbar instance."""

    label: str
    duration_seconds: float = 2.0
    action_label: str | None = None
    on_click_action: Callable[[me.ClickEvent], Any] | None = None
    horizontal_position: Literal["start", "center", "end"] = "center"
    vertical_position: Literal["start", "center", "end"] = "end"


class Snackbar:
    """A class representing a snackbar instance with its state and behavior."""

    def __init__(self, config: SnackbarConfig):
        self.config = config

        @me.stateclass
        class SnackbarState:
            is_visible: bool = False

        self._state_class = SnackbarState

    @property
    def is_visible(self) -> bool:
        """Get the current visibility state of the snackbar."""
        return me.state(self._state_class).is_visible

    def show(self):
        """Show the snackbar and automatically hide it after the configured duration."""
        me.state(self._state_class).is_visible = True
        yield
        time.sleep(self.config.duration_seconds)
        me.state(self._state_class).is_visible = False
        yield

    def render(self):
        """Render the snackbar component."""

        def on_close(event: me.ClickEvent):
            me.state(self._state_class).is_visible = False

        snackbar(
            is_visible=self.is_visible,
            label=self.config.label,
            on_click_close=on_close,
            action_label=self.config.action_label,
            on_click_action=self.config.on_click_action,
            horizontal_position=self.config.horizontal_position,
            vertical_position=self.config.vertical_position,
        )


snackbars = []


def create_snackbar(
    message: str,
    duration_seconds: float = 2.0,
) -> Callable[[], Generator[None, None, None]]:
    """Factory function to create a new snackbar instance."""
    snackbar = Snackbar(
        SnackbarConfig(label=message, duration_seconds=duration_seconds)
    )
    snackbars.append(snackbar)
    return snackbar.show


extension_reloaded_snackbar = create_snackbar("Reloaded extensions")


saved_extension_requirements_snackbar = create_snackbar(
    "Saved extensions requirements"
)

import os
import subprocess
from collections.abc import Callable

import mesop as me
import mesop.labs as mel
from dyad.logging.logging import logger

from dyad_app.web_components.dialog import dialog


@me.stateclass
class DialogState:
    dialog_open: bool = False
    repo_path: str = ""
    repo_url: str = ""


def course_repo_clone_dialog():
    dialog_state = me.state(DialogState)

    with dialog(open=dialog_state.dialog_open, on_close=on_close_dialog):
        with me.box(style=me.Style(width=400)):
            with me.box(
                style=me.Style(
                    padding=me.Padding(bottom=12),
                    display="flex",
                    flex_direction="column",
                    min_width="min(80vw, 360px)",
                    gap=16,
                )
            ):
                me.text(
                    "Clone Course Git Repo",
                    style=me.Style(font_size=24, font_weight=500),
                )
                me.text("Use the default path if you're not sure:")

                me.input(
                    value=dialog_state.repo_path,
                    label="Repository Path",
                    on_blur=lambda e: setattr(
                        dialog_state, "repo_path", e.value
                    ),
                    style=me.Style(width="100%"),
                )

            with me.box(
                style=me.Style(
                    display="flex",
                    flex_direction="row",
                    justify_content="end",
                    gap=6,
                    padding=me.Padding(top=12),
                )
            ):
                me.button(
                    "Cancel",
                    on_click=lambda e: on_close_dialog(),
                    # style=me.Style(margin_right=8),
                )
                me.button(
                    "Clone",
                    on_click=lambda e: handle_clone(dialog_state.repo_path),
                    # variant="filled",
                )


def open_course_repo_clone_dialog(*, repo_url: str, repo_path: str):
    state = me.state(DialogState)
    state.repo_url = repo_url
    state.repo_path = repo_path
    state.dialog_open = True


def on_close_dialog(e: mel.WebEvent | None = None):
    state = me.state(DialogState)
    state.dialog_open = False


_on_success = None


def set_on_success(callback: Callable):
    global _on_success
    _on_success = callback


def handle_clone(repo_path: str):
    logger().info(f"Cloning repository from: {repo_path}")
    state = me.state(DialogState)
    if not os.path.exists(repo_path):
        os.makedirs(repo_path)
    subprocess.run(["git", "clone", state.repo_url, repo_path], check=True)
    if _on_success:
        _on_success(repo_path=repo_path)
    on_close_dialog()

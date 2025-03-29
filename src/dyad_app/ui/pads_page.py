from functools import partial

import mesop as me
from dyad.pad import Pad
from dyad.settings.workspace_settings import get_workspace_settings
from dyad.storage.models.pad import get_pad, get_pads, save_pad

from dyad_app.ui.pad_tags import pad_tags
from dyad_app.ui.pads.default_pad import DEFAULT_PAD_CONTENT
from dyad_app.ui.page_utils import SECURITY_POLICY, STYLESHEETS
from dyad_app.ui.scaffold import scaffold
from dyad_app.ui.side_pane import side_pane
from dyad_app.ui.side_pane_state import get_side_pane, set_side_pane
from dyad_app.ui.state import State
from dyad_app.ui.theme_utils import load_theme_mode_from_settings
from dyad_app.web_components.copy_to_clipboard import copy_to_clipboard
from dyad_app.web_components.snackbar import create_snackbar


def on_load(e: me.LoadEvent):
    state = me.state(State)
    state.page = "pads"
    load_theme_mode_from_settings()
    create_default_pad_if_none()


def create_default_pad_if_none():
    if not get_pads():
        pad = Pad(
            id="default",
            title="Welcome to Pads!",
            content=DEFAULT_PAD_CONTENT,
            complete=True,
            type="text/markdown",
        )
        save_pad(pad)


@me.page(
    security_policy=SECURITY_POLICY,
    stylesheets=STYLESHEETS,
    title="Dyad - Pads",
    path="/pads",
    on_load=on_load,
)
def page():
    copy_to_clipboard()
    with scaffold(page_title="Pads"):
        with me.box(
            style=me.Style(
                flex_grow=1,
                display="flex",
                flex_direction="row",
                overflow="hidden",
                position="relative",
                background=me.theme_var("surface-container-lowest"),
                border_radius="16px 0 0 0",
            )
        ):
            body()
            side_pane()


def body():
    with me.box(
        style=me.Style(flex_grow=1, display="flex", flex_direction="column")
    ):
        sync_box()
        with me.box(
            style=me.Style(
                padding=me.Padding.symmetric(vertical=16, horizontal=16),
                border_radius=16,
                background=me.theme_var("surface-container-lowest"),
                display="grid",
                overflow="auto",
                grid_template_columns="repeat(auto-fill, minmax(270px, 1fr))",
                gap=16,
            )
        ):
            for pad in get_pads():
                pad_box(pad)


@me.stateclass
class EditSyncPathState:
    is_editing: bool = False
    glob_path_value: str = ""


def click_edit_sync_path(e: me.ClickEvent):
    state = me.state(EditSyncPathState)
    state.is_editing = True


def click_save_sync_path(e: me.ClickEvent):
    state = me.state(EditSyncPathState)
    workspace_settings = get_workspace_settings()
    workspace_settings.pads_glob_path = state.glob_path_value
    workspace_settings.save()
    state.is_editing = False
    state.glob_path_value = ""
    yield from pads_path_updated_snackbar()


def on_sync_path_blur(e: me.InputBlurEvent):
    state = me.state(EditSyncPathState)
    state.glob_path_value = e.value


pads_path_updated_snackbar = create_snackbar(
    "Pads sync path updated! Please restart Dyad to re-sync pads.",
    duration_seconds=5,
)


def sync_box():
    with me.box(
        style=me.Style(
            display="flex",
            align_items="center",
            padding=me.Padding(left=20, top=12),
            gap=8,
            visibility="hidden" if get_side_pane() else "visible",
        )
    ):
        if me.state(EditSyncPathState).is_editing:
            me.input(
                label="Sync path",
                value=get_workspace_settings().pads_glob_path,
                on_blur=on_sync_path_blur,
                subscript_sizing="dynamic",
                style=me.Style(
                    width=300,
                    padding=me.Padding.all(8),
                    border_radius=8,
                    background=me.theme_var("surface-container-low"),
                ),
            )
            with me.tooltip(message="Save sync path"):
                with me.content_button(
                    type="icon",
                    on_click=click_save_sync_path,
                ):
                    me.icon("save")
        else:
            me.text("Syncing with:", style=me.Style(font_weight=500))
            me.text(get_workspace_settings().pads_glob_path)
            if not get_side_pane():
                with me.tooltip(message="Edit sync path"):
                    with me.content_button(
                        type="icon",
                        on_click=click_edit_sync_path,
                    ):
                        me.icon("edit")


def pad_box(pad: Pad):
    assert pad.id is not None
    with me.box(
        style=me.Style(
            padding=me.Padding.all(16),
            border_radius=16,
            background=me.theme_var("surface-container-low"),
            height=300,
            width="100%",
            overflow="hidden",
            cursor="pointer",
        ),
        on_click=partial(click_pad, pad_id=pad.id),
    ):
        me.text(pad.title, style=me.Style(font_size=16, font_weight="bold"))
        pad_tags(pad)
        me.markdown(pad.content, style=me.Style(font_size=14))


def click_pad(e: me.ClickEvent, pad_id: str):
    state = me.state(State)
    set_side_pane("pad")
    state.pad = get_pad(pad_id)

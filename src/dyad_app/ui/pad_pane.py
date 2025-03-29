from copy import deepcopy
from typing import Literal

import mesop as me
import mesop.labs as mel
from dyad.pad import (
    GlobSelectionCriteria,
    SelectionInstructionCriteria,
)
from dyad.pad_logic import get_matching_files
from dyad.storage.models.pad import delete_pad, get_pad, save_pad
from dyad.suggestions import get_all_files
from dyad.workspace_util import is_path_within_workspace

from dyad_app.sandpack import react_sandpack
from dyad_app.ui.pad_tags import pad_tags
from dyad_app.ui.side_pane_state import set_reset_pad_pane_state, set_side_pane
from dyad_app.ui.state import State
from dyad_app.web_components.copy_to_clipboard import write_to_clipboard
from dyad_app.web_components.pad_input import pad_input
from dyad_app.web_components.snackbar import create_snackbar

saved_pad_file_path_snackbar = create_snackbar("Wrote pad to filesystem")
pad_file_path_error_snackbar = create_snackbar(
    "Error! File path must be within workspace directory",
    duration_seconds=5.0,
)


def on_blur(e: mel.WebEvent):
    state = me.state(State)
    if not state.pad:
        raise ValueError("No pad selected")

    state.pad.content = e.value["value"]
    save_pad(state.pad)
    me.state(PadPaneState).pad_save_status = "saved"


def on_save(e: me.ClickEvent):
    state = me.state(State)
    if not state.pad:
        raise ValueError("No pad selected")

    save_pad(state.pad)


def on_input(e: mel.WebEvent):
    value = e.value["value"]
    state = me.state(State)
    if not state.pad:
        raise ValueError("No pad selected")
    db_pad = get_pad(state.pad.id)
    # The first edit should result in a save.
    if db_pad is None:
        # Do not mutate the state.pad directly, because we don't want to
        # trigger a re-render of the pad_input web component.
        copied_pad = deepcopy(state.pad)
        copied_pad.content = value
        save_pad(copied_pad)
        return

    if db_pad.content != value:
        me.state(PadPaneState).pad_save_status = "dirty"


def on_delete(e: me.ClickEvent):
    state = me.state(State)
    if not state.pad:
        raise ValueError("No pad selected")
    if state.pad.id is None:
        raise ValueError("Pad has no id")
    delete_pad(state.pad.id)
    state.pad = None
    set_side_pane()


@set_reset_pad_pane_state
def reset_pad_pane_state():
    state = me.state(PadPaneState)
    state.tab = "default"
    state.selection_criteria = "none"
    state.auto_prompt_context = False


def on_copy(e: me.ClickEvent):
    state = me.state(State)
    if not state.pad:
        raise ValueError("No pad selected")
    write_to_clipboard(state.pad.content)


def on_edit_or_configure(e: me.ButtonToggleChangeEvent):
    pane_state = me.state(PadPaneState)
    pane_state.tab = e.value  # type: ignore


def pad_pane_header_actions():
    pad = me.state(State).pad
    assert pad is not None
    if not pad.complete:
        me.progress_spinner(diameter=24, stroke_width=3)
        return
    me.box()


def get_buttons():
    if is_preview_ready():
        return [
            me.ButtonToggleButton(label="Preview", value="preview"),
            me.ButtonToggleButton(label="Code", value="edit"),
        ]
    if is_previewable():
        return [
            me.ButtonToggleButton(label="Code", value="edit"),
        ]
    return [
        me.ButtonToggleButton(label="Edit", value="edit"),
        me.ButtonToggleButton(label="Configure", value="configure"),
    ]


def pane_pane_tools_row():
    state = me.state(State)
    assert state.pad is not None
    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="row",
            align_items="center",
            gap=8,
            padding=me.Padding(top=12, bottom=8),
        )
    ):
        me.button_toggle(
            value=get_current_tab(),
            buttons=get_buttons(),
            on_change=on_edit_or_configure,
        )
        with me.tooltip(message="Save"):
            with me.content_button(
                on_click=on_save,
                type="icon",
            ):
                me.icon("save")

        with me.tooltip(message="Copy"):
            with me.content_button(
                on_click=on_copy,
                type="icon",
            ):
                me.icon("content_copy")
        with me.tooltip(message="Delete"):
            with me.content_button(
                on_click=on_delete,
                type="icon",
            ):
                me.icon("delete")
        if me.state(PadPaneState).tab != "configure":
            save_status_box()


def save_status_box():
    state = me.state(PadPaneState)
    if state.pad_save_status == "dirty":
        with me.box(
            style=me.Style(display="flex", gap=4, align_items="center")
        ):
            me.text(
                "Unsaved",
                style=me.Style(
                    font_size=14,
                    font_weight=500,
                    color=me.theme_var("outline"),
                    text_overflow="ellipsis",
                    overflow="hidden",
                    white_space="nowrap",
                ),
            )
            with me.tooltip(
                message="Pad will automatically be saved when you click on anything else"
            ):
                me.icon(
                    "info",
                    style=me.Style(
                        font_size=20,
                        color=me.theme_var("outline"),
                        margin=me.Margin(top=6),
                    ),
                )
    elif state.pad_save_status == "saved":
        me.text(
            "Saved",
            style=me.Style(
                font_size=14,
                font_weight=500,
                color=me.theme_var("outline"),
            ),
        )


@me.stateclass
class PadPaneState:
    pad_save_status: Literal["dirty", "saved", "clean"] = "clean"
    tab: Literal["default", "preview", "edit", "configure"] = "default"
    auto_prompt_context: bool = False
    selection_criteria: Literal["glob", "selection_instruction", "none"] = (
        "none"
    )
    matching_files_count: int | None = None
    matching_files: list[str]
    contents_file_path: str = ""


def on_auto_prompt_context(e: me.SlideToggleChangeEvent):
    state = me.state(PadPaneState)
    state.auto_prompt_context = not state.auto_prompt_context


def on_selection_criteria_change(e: me.SelectSelectionChangeEvent):
    pane_state = me.state(PadPaneState)
    pane_state.selection_criteria = e.value  # type: ignore
    if pane_state.selection_criteria == "none":
        state = me.state(State)
        assert state.pad is not None
        state.pad.selection_criteria = None
        save_pad(state.pad)


def on_glob_pattern_blur(e: me.InputBlurEvent):
    state = me.state(State)
    assert state.pad is not None
    state.pad.selection_criteria = GlobSelectionCriteria(
        type="glob", glob_pattern=e.value
    )
    save_pad(state.pad)


def on_glob_pattern_input(e: me.InputEvent):
    pane_state = me.state(PadPaneState)
    matching_files = get_matching_files(
        file_candidates=get_all_files(), glob_pattern=e.value
    )
    pane_state.matching_files_count = len(matching_files)
    pane_state.matching_files = matching_files[:10]


def on_selection_instruction_blur(e: me.InputBlurEvent):
    state = me.state(State)
    assert state.pad is not None
    state.pad.selection_criteria = SelectionInstructionCriteria(
        type="selection_instruction", selection_instruction=e.value
    )
    save_pad(state.pad)


def on_file_path_blur(e: me.InputBlurEvent):
    pane_state = me.state(PadPaneState)
    pane_state.contents_file_path = e.value


def on_file_path_save(e: me.ClickEvent):
    state = me.state(State)
    pane_state = me.state(PadPaneState)
    assert state.pad is not None
    file_path = pane_state.contents_file_path or ""

    if file_path.strip():
        if not is_path_within_workspace(file_path.strip()):
            yield from pad_file_path_error_snackbar()
            return
        state.pad.file_path = file_path.strip()
    else:
        state.pad.file_path = None

    save_pad(state.pad)
    yield from saved_pad_file_path_snackbar()


def pad_pane_settings():
    pane_state = me.state(PadPaneState)
    state = me.state(State)
    assert state.pad is not None

    with me.box(
        style=me.Style(
            display="flex",
            flex_direction="column",
            gap=16,
            padding=me.Padding.symmetric(vertical=16, horizontal=16),
        )
    ):
        # File path configuration section
        me.text("Content Source", style=me.Style(font_weight=500, font_size=18))
        me.text(
            "Optionally specify a file path to read the pad's content from",
            style=me.Style(font_size=14),
        )
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="row",
                gap=8,
                align_items="center",
            )
        ):
            me.input(
                appearance="outline",
                label="File path (relative to workspace)",
                on_blur=on_file_path_blur,
                style=me.Style(flex_grow=1),
                value=state.pad.file_path or "",
                placeholder="e.g., pads/api-spec.md",
                subscript_sizing="dynamic",
            )
            with me.tooltip(message="Save file path"):
                with me.content_button(
                    on_click=on_file_path_save,
                    type="icon",
                ):
                    me.icon("save")

        # Selection settings sections
        me.text(
            "Auto prompt context", style=me.Style(font_weight=500, font_size=18)
        )
        me.text(
            "You can decide whether to automatically include this prompt",
            style=me.Style(font_size=14),
        )
        current_selection_criteria = pane_state.selection_criteria
        if (
            current_selection_criteria == "none"
            and state.pad
            and state.pad.selection_criteria
        ):
            current_selection_criteria = state.pad.selection_criteria.type

        me.select(
            value=current_selection_criteria,
            label="Selection criteria",
            options=[
                me.SelectOption(label="None", value="none"),
                me.SelectOption(label="Glob pattern", value="glob"),
                me.SelectOption(
                    label="Instruction", value="selection_instruction"
                ),
            ],
            on_selection_change=on_selection_criteria_change,
        )
        if isinstance(state.pad.selection_criteria, GlobSelectionCriteria):
            glob_pattern = state.pad.selection_criteria.glob_pattern
        else:
            glob_pattern = ""
        if isinstance(
            state.pad.selection_criteria, SelectionInstructionCriteria
        ):
            selection_instruction = (
                state.pad.selection_criteria.selection_instruction
            )
        else:
            selection_instruction = ""

        if current_selection_criteria == "glob":
            me.text(
                "Glob pattern applies whenever you're editing a file that matches the glob pattern (e.g. *.ts, **/tests/*.py)",
                style=me.Style(font_size=14),
            )
            me.input(
                appearance="outline",
                label="Glob pattern",
                style=me.Style(width="100%"),
                on_blur=on_glob_pattern_blur,
                on_input=on_glob_pattern_input,
                value=glob_pattern,
            )
            if glob_pattern and pane_state.matching_files_count:
                me.text(
                    f"Found {pane_state.matching_files_count} files matching the glob pattern",
                    style=me.Style(font_size=14),
                )
                for file in pane_state.matching_files:
                    me.text(file, style=me.Style(font_size=14))
        elif current_selection_criteria == "selection_instruction":
            me.text(
                "Selection instruction tells the Router LLM when to include your pad as prompt context for the main LLM call",
                style=me.Style(font_size=14),
            )
            me.textarea(
                label="Selection instruction",
                style=me.Style(width="100%"),
                on_blur=on_selection_instruction_blur,
                value=selection_instruction,
            )


def is_preview_ready():
    state = me.state(State)
    return state.pad and state.pad.complete and is_previewable()


def is_previewable():
    state = me.state(State)
    return state.pad and state.pad.type in (
        "text/html",
        "image/svg+xml",
        "application/vnd.dyad.react",
    )


def get_current_tab() -> Literal["preview", "edit", "configure"]:
    tab = me.state(PadPaneState).tab
    if tab == "default" and is_preview_ready():
        return "preview"
    if tab == "default":
        return "edit"
    return tab


def pad_pane():
    state = me.state(State)
    pane_pane_tools_row()
    tab = get_current_tab()

    if tab == "configure":
        with me.box(style=me.Style(overflow_y="auto")):
            pad_pane_settings()
    elif tab == "preview":
        pad_pane_preview()
    else:
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="column",
                gap=8,
                overflow="auto",
            )
        ):
            if state.pad:
                if is_previewable():
                    with me.box(
                        style=me.Style(margin=me.Margin(top=12), font_size=14)
                    ):
                        if state.pad.type in ("text/html", "image/svg+xml"):
                            me.code(state.pad.content, language="html")
                        elif state.pad.type == "application/vnd.dyad.react":
                            me.code(state.pad.content, language="javascript")
                        else:
                            me.text("Unsupported pad type: " + state.pad.type)
                    return
                pad_tags(state.pad)
                pad_input(
                    value=state.pad.content,
                    on_blur=on_blur,
                    on_input=on_input,
                    disabled=not state.pad.complete,
                )
            else:
                me.text("No pad selected")


def pad_pane_preview():
    state = me.state(State)
    assert state.pad is not None
    with me.box(
        style=me.Style(
            border_radius=16,
            # padding=me.Padding.all(16),
            margin=me.Margin(top=12),
            background=me.theme_var("surface-container-lowest"),
            # flex_grow=1,
        )
    ):
        if state.pad.type == "application/vnd.dyad.react":
            with me.box(
                style=me.Style(
                    height="calc(100vh - 350px)",
                )
            ):
                react_sandpack(state.pad.content)
            return
        me.html(
            SCROLLBAR_STYLE + state.pad.content,
            mode="sandboxed",
            style=me.Style(
                width="100%",
                height="calc(100vh - 350px)",
            ),
        )


# Copied from https://github.com/mesop-dev/mesop/blob/06ab2a4ba12b953eec971e449ca7dd71abe2a411/mesop/web/src/app/styles.scss#L224C1-L263C1
SCROLLBAR_STYLE = """
<style>
@media (pointer: fine) {
  @supports not (selector(::-webkit-scrollbar)) {
    * {
      scrollbar-color: #dadce0 transparent;
      scrollbar-gutter: auto;
      scrollbar-width: thin;
    }
  }

  ::-webkit-scrollbar,
  ::-webkit-scrollbar-corner {
    background: transparent;
    height: 12px;
    width: 12px;
  }

  ::-webkit-scrollbar-thumb {
    background: content-box currentColor;
    border: 2px solid transparent;
    border-radius: 8px;
    color: #dadce0;
    min-height: 48px;
    min-width: 48px;
  }

  :hover::-webkit-scrollbar-thumb {
    color: #80868b;
  }

  ::-webkit-scrollbar-thumb:active {
    color: #5f6368;
  }

  ::-webkit-scrollbar-button {
    height: 0;
    width: 0;
  }
}
</style>
"""

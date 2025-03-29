import mesop as me
import mesop.labs as mel
from dyad.extension.extension_registry import extension_registry
from dyad.utils.user_data_dir_utils import get_extensions_requirements_path
from dyad_app.web_components.code_editor import code_editor
from dyad_app.web_components.snackbar import (
    saved_extension_requirements_snackbar,
)


def extensions_settings():
    with me.box(
        style=me.Style(
            display="flex", flex_direction="row", gap=12, height="100%"
        )
    ):
        extension_list()
        extension_editor()


def extension_list():
    with me.box(
        style=me.Style(
            display="flex", flex_direction="column", gap=12, width=280
        )
    ):
        me.text(
            "Loaded Extensions", style=me.Style(font_size=18, font_weight=500)
        )
        extensions = extension_registry.get_extensions()
        for ext in extensions:
            me.text(ext)


def extension_editor():
    with open(get_extensions_requirements_path()) as f:
        code = f.read()

    with me.box(
        style=me.Style(
            display="flex",
            flex_grow=1,
            flex_direction="column",
            gap=12,
        )
    ):
        me.text(
            "Extension Editor", style=me.Style(font_size=18, font_weight=500)
        )
        with me.box(
            style=me.Style(display="flex", gap=4, align_items="center")
        ):
            with me.box(style=me.Style(min_width=36)):
                with me.tooltip(message="Save"):
                    with me.content_button(type="icon", on_click=on_save):
                        me.icon("save")
            me.text("Path:", style=me.Style(font_weight=500))
            me.text(
                get_extensions_requirements_path(),
                style=me.Style(
                    font_size=13,
                    font_family="monospace",
                    white_space="nowrap",
                    text_overflow="ellipsis",
                    overflow="hidden",
                ),
            )

        with me.box(style=me.Style(flex_grow=1)):
            code_editor(
                code=code,
                language="txt",
                on_updated_doc=on_updated_doc,
            )


def on_save(e: me.ClickEvent):
    state = me.state(EditorState)
    with open(get_extensions_requirements_path(), "w") as f:
        f.write(state.text)
    yield from saved_extension_requirements_snackbar()


@me.stateclass
class EditorState:
    text: str


def on_updated_doc(doc: mel.WebEvent):
    state = me.state(EditorState)
    state.text = doc.value["doc"]

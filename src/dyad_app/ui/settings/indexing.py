import mesop as me
from dyad.indexing.embeddings.embedding_provider import (
    get_embedding_models,
    get_embedding_providers,
)
from dyad.indexing.file_indexing import clear_cache_and_restart
from dyad.language_model.language_model_clients import (
    get_language_model_provider,
)
from dyad.settings.user_settings import get_user_settings
from dyad.settings.workspace_settings import get_workspace_settings
from dyad.suggestions import get_all_files


@me.stateclass
class IndexingState:
    filter_text: str = ""

    def get_filtered_files(self) -> list[str]:
        """Returns filtered files as full paths."""
        all_files = get_all_files()
        if not self.filter_text:
            return sorted(all_files)

        query = self.filter_text.lower()
        filtered = [
            file_path for file_path in all_files if query in file_path.lower()
        ]
        return sorted(filtered)


def on_ignore_files_enabled_change(e: me.SlideToggleChangeEvent):
    settings = get_workspace_settings()
    settings.ignore_files_enabled = not settings.ignore_files_enabled
    settings.save()


def on_embeddings_provider_change(e: me.SelectSelectionChangeEvent):
    provider_id = e.value
    embedding_model = get_embedding_models(provider_id)[0]
    settings = get_user_settings()
    settings.embedding_model_config = embedding_model
    settings.save()
    clear_cache_and_restart()


def indexing_settings():
    providers = get_embedding_providers()

    options = [
        me.SelectOption(
            label=get_language_model_provider(
                provider.provider_id
            ).display_name,
            value=provider.provider_id,
        )
        for provider in providers
    ]
    selected_provider_id = ""
    embedding_model_config = get_user_settings().embedding_model_config
    if embedding_model_config is not None:
        selected_provider_id = embedding_model_config.provider_id

    state = me.state(IndexingState)
    all_files = get_all_files()
    filtered_files = state.get_filtered_files()
    with me.box(
        style=me.Style(
            display="flex",
            gap=16,
            flex_wrap="wrap",
        ),
    ):
        box_style = me.Style(
            padding=me.Padding.all(16),
            border_radius=8,
            background=me.theme_var("surface-container"),
            display="flex",
            flex_direction="column",
            align_items="center",
            gap=8,
            flex_grow=1,
            max_width=300,
        )
        with me.box(style=box_style):
            me.text(
                "Manage indexing",
                style=me.Style(margin=me.Margin(bottom=8), font_weight=500),
            )

            # Actions section
            with me.box(style=me.Style(margin=me.Margin(bottom=8))):
                me.button(
                    "Clear & restart indexing",
                    type="flat",
                    on_click=on_click_clear_index_cache,
                )

        with me.box(style=box_style):
            me.text(
                "Files indexed",
                style=me.Style(font_weight=500),
            )
            me.text(f"{len(all_files)}", style=me.Style(font_size=32))
        with me.box(style=box_style):
            me.text("Embeddings provider", style=me.Style(font_weight=500))
            me.select(
                label="Provider",
                options=options,
                value=selected_provider_id,
                on_selection_change=on_embeddings_provider_change,
                appearance="outline",
            )
            if embedding_model_config is not None:
                me.text(
                    f"{embedding_model_config.embedding_model_name} ({embedding_model_config.embedding_dim} dim)",
                    style=me.Style(font_size=14),
                )
            me.text(
                "Note: changing this will restart indexing.",
                style=me.Style(font_size=14),
            )
        with me.box(style=box_style):
            with me.box(
                style=me.Style(display="flex", align_items="center", gap=8)
            ):
                me.text("Ignore files", style=me.Style(font_weight=500))
                with me.tooltip(
                    message="Ignore files listed in the `.dyadignore` file in the root of your workspace.",
                ):
                    me.icon("info")

            with me.box(
                style=me.Style(display="flex", align_items="center", gap=12)
            ):
                me.markdown("`.dyadignore`")
                me.slide_toggle(
                    "Enabled",
                    checked=get_workspace_settings().ignore_files_enabled,
                    on_change=on_ignore_files_enabled_change,
                )
            me.text(
                "Note: you need to restart Dyad for changes to take effect.",
                style=me.Style(font_size=14),
            )

    with me.box(
        style=me.Style(
            padding=me.Padding.all(16),
            border_radius=8,
            background=me.theme_var("surface-container"),
            display="flex",
            flex_direction="column",
            align_items="center",
            gap=8,
            flex_grow=1,
        )
    ):
        # Single column table header
        with me.box(
            style=me.Style(
                display="flex",
                align_items="center",
                justify_content="space-between",
                gap=4,
                width="100%",
            )
        ):
            me.text("File Path", style=me.Style(font_weight=500))
            me.input(
                label="Filter files",
                value=state.filter_text,
                on_input=on_filter_change,
                style=me.Style(width="300px"),
                appearance="outline",
                subscript_sizing="dynamic",
            )

        # Table body
        with me.box(
            style=me.Style(
                display="grid",
                grid_template_columns="1fr",
                gap=2,
                width="100%",
                max_height="350px",
                overflow_y="auto",
                font_size=15,
            )
        ):
            for file_path in filtered_files:
                me.text(
                    file_path,
                )


def on_click_clear_index_cache(e: me.ClickEvent):
    clear_cache_and_restart()


def on_filter_change(e: me.InputEvent):
    state = me.state(IndexingState)
    state.filter_text = e.value

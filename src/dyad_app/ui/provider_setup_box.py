from functools import partial

import mesop as me
from dyad.language_model.language_model_clients import is_provider_setup

from dyad_app.ui.provider_setup_dialog import open_provider_setup_dialog


def provider_setup_box(
    *,
    display_text: str,
    provider: str,
    badge_text: str | None = None,
):
    with me.box(
        style=me.Style(
            background=me.theme_var("surface-container"),
            padding=me.Padding(
                left=16,
                right=16,
                top=16,
                bottom=12,
            ),
            border_radius=16,
            cursor="pointer",
            min_width=180,
            max_height=80,
        ),
        on_click=partial(
            click_setup_provider,
            provider=provider,
            display_text=display_text,
        ),
        classes="hover-surface-container-high",
    ):
        me.text(display_text, style=me.Style(font_size=18))
        me.box(style=me.Style(height=4))
        if is_provider_setup(provider):
            with me.box(
                style=me.Style(
                    display="flex",
                    align_items="center",
                )
            ):
                me.icon("checkmark")
                me.box(style=me.Style(width=8))
                me.text(
                    "Ready to use",
                    style=me.Style(font_size=14),
                )
        else:
            with me.box(
                style=me.Style(
                    display="flex",
                    justify_content="space-between",
                    align_items="center",
                )
            ):
                me.text(
                    "Requires setup",
                    style=me.Style(font_size=14),
                )
                if badge_text:
                    me.text(
                        badge_text,
                        style=me.Style(
                            background=me.theme_var("secondary-container"),
                            padding=me.Padding.all(8),
                            border_radius=8,
                            font_weight=500,
                            font_size=14,
                        ),
                    )


def click_setup_provider(e: me.ClickEvent, provider: str, display_text: str):
    open_provider_setup_dialog(provider=provider)

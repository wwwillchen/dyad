import os

import mesop as me
from dyad.pad import Pad


def pad_tags(pad: Pad):
    with me.box(style=me.Style(display="inline-flex", flex_wrap="wrap", gap=8)):
        if pad.file_path:
            with me.box(style=me.Style(display="flex", flex_wrap="wrap")):
                me.text(
                    "File: " + os.path.basename(pad.file_path)[-10:],
                    style=me.Style(
                        font_size=14,
                        font_weight=500,
                        color=me.theme_var("on-secondary"),
                        background=me.theme_var("secondary"),
                        padding=me.Padding.symmetric(vertical=4, horizontal=8),
                        border_radius=8,
                        margin=me.Margin(top=8),
                    ),
                )

        if pad.selection_criteria:
            with me.box(style=me.Style(display="flex", flex_wrap="wrap")):
                me.text(
                    f"{' '.join(pad.selection_criteria.type.split('_')).capitalize()}",
                    style=me.Style(
                        font_size=14,
                        font_weight=500,
                        color=me.theme_var("on-secondary"),
                        background=me.theme_var("secondary"),
                        padding=me.Padding.symmetric(vertical=4, horizontal=8),
                        border_radius=8,
                        margin=me.Margin(top=8),
                    ),
                )

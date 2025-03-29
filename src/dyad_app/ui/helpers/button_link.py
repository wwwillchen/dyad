import mesop as me


def button_link(
    *,
    text: str,
    url: str,
    color: str,
    background: str,
    same_tab: bool = False,
    is_large: bool = False,
):
    me.link(
        text=text,
        url=url,
        style=me.Style(
            # font_weight=500,
            color=color,
            text_decoration="none",
            background=background,
            padding=me.Padding.symmetric(
                horizontal=16 if is_large else 12, vertical=8 if is_large else 4
            ),
            border_radius=8 if is_large else 4,
            margin=me.Margin(right=8),
            line_height=1.75 if is_large else None,
        ),
        open_in_new_tab=not same_tab,
    )


def subscribe_to_dyad_pro_button_link():
    button_link(
        is_large=True,
        text="Subscribe to Dyad Pro",
        url="https://www.dyad.sh/#plans",
        color=me.theme_var("on-primary"),
        background=me.theme_var("primary"),
    )

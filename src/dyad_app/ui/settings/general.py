import mesop as me
from dyad.settings.user_settings import get_user_settings


def general_settings():
    me.text("Analytics")
    me.checkbox(
        "Help improve Dyad by sending anonymous usage data",
        checked=get_user_settings().analytics.enabled,
        on_change=on_change_analytics_enabled,
    )
    me.divider()
    me.text("Workspace name")
    me.input(
        label="Workspace name",
        value=get_user_settings().workspace_name(),
        on_blur=update_workspace_name,
    )
    me.divider()
    me.text("Theme mode")
    me.button_toggle(
        value=get_user_settings().theme_mode,
        buttons=[
            me.ButtonToggleButton(label="Light", value="light"),
            me.ButtonToggleButton(label="Dark", value="dark"),
            me.ButtonToggleButton(label="System", value="system"),
        ],
        on_change=on_change_theme_mode,
    )


def update_workspace_name(e: me.InputBlurEvent):
    settings = get_user_settings()
    settings.set_workspace_name(e.value)
    settings.save()


def on_change_theme_mode(e: me.ButtonToggleChangeEvent):
    me.set_theme_mode(e.value)  # type: ignore
    settings = get_user_settings()
    settings.theme_mode = e.value
    settings.save()


def on_change_analytics_enabled(e: me.CheckboxChangeEvent):
    settings = get_user_settings()
    settings.analytics.enabled = e.checked
    if not settings.analytics.enabled:
        settings.analytics.uuid = None
    settings.save()

import mesop as me
from dyad.logging.analytics import analytics
from dyad.settings.user_settings import get_user_settings

from dyad_app.web_components.dialog import dialog


@me.stateclass
class AnalyticsConsentState:
    dialog_open: bool = False
    has_shown_consent: bool = False


def on_close_dialog():
    dialog_state = me.state(AnalyticsConsentState)
    dialog_state.dialog_open = False


def analytics_consent_dialog():
    state = me.state(AnalyticsConsentState)
    # settings = get_settings()

    # if not state.dialog_open or state.has_shown_consent:
    #     return

    with dialog(
        open=state.dialog_open,
        on_close=lambda e: on_close_dialog(),
        disable_soft_dismiss=True,
    ):
        with me.box(
            style=me.Style(
                display="flex",
                flex_direction="column",
                # width="min(600px, 80%)",
                # height=400,
                padding=me.Padding.all(16),
            )
        ):
            me.text(
                "Help Improve Dyad",
                style=me.Style(
                    font_size=24, font_weight=500, margin=me.Margin(bottom=16)
                ),
            )
            me.markdown(
                """Dyad collects anonymous usage data to enhance our developer tool:

- **Anonymous Identifier**: We assign a unique, anonymous ID to each user
- **Limited Data Collection**: We collect non-sensitive metadata like feature usage
- **Privacy Protected**: We do *not* collect core content such as prompts, code, or AI outputs
- **Opt-Out Anytime**: You can disable analytics anytime in the settings
""",
                style=me.Style(line_height=1.5),
            )

            with me.box(
                style=me.Style(
                    display="flex",
                    justify_content="end",
                    gap=8,
                )
            ):
                me.button(
                    "Accept",
                    type="flat",
                    on_click=lambda _: handle_consent(True),
                )
                me.button(
                    "Decline",
                    type="stroked",
                    on_click=lambda _: handle_consent(False),
                )


def handle_consent(accepted: bool):
    state = me.state(AnalyticsConsentState)
    settings = get_user_settings()
    settings.analytics.enabled = accepted
    settings.analytics.consent_shown = True
    settings.save()
    state.dialog_open = False
    state.has_shown_consent = True
    if accepted:
        analytics().record_analytics_consent_dialog_accept()


def show_analytics_consent():
    state = me.state(AnalyticsConsentState)
    settings = get_user_settings()
    if not settings.analytics.consent_shown:
        state.dialog_open = True

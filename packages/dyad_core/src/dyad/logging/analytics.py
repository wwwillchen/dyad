import uuid
from typing import Any

from dyad.logging.logging import logger
from dyad.settings.user_settings import get_user_settings
from dyad.utils.app_mode import is_viewer_mode


class Analytics:
    def __init__(self):
        self._posthog = None
        if get_user_settings().analytics.enabled:
            logger().info("Analytics enabled")
        else:
            logger().info("Analytics disabled")

    @property
    def posthog(self):
        if self._posthog is not None:
            return self._posthog

        from posthog import Posthog

        self._posthog = Posthog(
            project_api_key="phc_guFwWDM3x8GkWgfktG5uNKRO9iGXmomqTbPNgNcUe98",
            host="https://us.i.posthog.com",
        )
        return self._posthog

    def _get_distinct_id(self) -> str:
        settings_uuid = get_user_settings().analytics.uuid
        if settings_uuid is not None:
            return settings_uuid
        else:
            settings_uuid = str(uuid.uuid4())
            settings = get_user_settings()
            settings.analytics.uuid = settings_uuid
            settings.save()
            return settings_uuid

    def _record_event(
        self, event: str, properties: dict[str, Any] | None = None
    ):
        if is_viewer_mode():
            # Do not record analytics events in viewer mode, we use umami.
            return
        if get_user_settings().analytics.enabled:
            logger().info(
                "📊 [analytics] record %s | properties=%s", event, properties
            )
            properties = properties or {}
            properties["$ip"] = "n/a"

            self.posthog.capture(
                distinct_id=self._get_distinct_id(),
                event=event,
                properties=properties,
            )

    def record_analytics_consent_dialog_accept(self):
        self._record_event("analytics_consent_dialog_accept")

    def record_startup(self):
        self._record_event("startup")

    def record_create_chat(self):
        self._record_event("chat_create")

    def record_send_chat_message(self):
        self._record_event(
            "chat_message_send",
            {
                "editor_language_model_id": get_user_settings().editor_language_model_id,
                "core_language_model_id": get_user_settings().core_language_model_id,
            },
        )


_analytics = Analytics()


def analytics() -> Analytics:
    return _analytics

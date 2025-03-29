import mesop as me
from dyad.api.api_base import get_api_base_url

SECURITY_POLICY = me.SecurityPolicy(
    # allowed_trusted_types=["dompurify"],
    dangerously_disable_trusted_types=True,
    allowed_connect_srcs=[
        "https://*.mux.com",
        # litix.io is owned by mux for video analytics
        "https://*.litix.io/",
        "https://login.dyad.sh",
        get_api_base_url(),
    ],
)

STYLESHEETS = [
    "/static/styles.css",
    # Used for Monaco
    "/static/build/static/css/index.css",
    "https://fonts.googleapis.com/css2?family=Geist+Mono:wght@100..900&family=Geist:wght@100..900&display=swap",
]

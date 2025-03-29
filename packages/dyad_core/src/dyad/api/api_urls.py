from dyad.api.api_base import get_api_base_url


def get_checkout_url():
    return get_api_base_url() + "/create-checkout-session"


def get_subscription_status_url():
    return get_api_base_url() + "/subscription-status"


def get_course_url():
    return get_api_base_url() + "/course"


def get_course_asset_url(asset_id: str):
    return get_api_base_url() + "/course-asset?asset-id=" + asset_id

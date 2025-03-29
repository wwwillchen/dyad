from dyad.utils.app_mode import is_viewer_mode


def get_js_bundle_path():
    if is_viewer_mode():
        return "../static/build/viewer_bundle.js"
    return "../static/build/index.js"

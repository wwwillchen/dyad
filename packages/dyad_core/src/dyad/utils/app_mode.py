import os


def is_viewer_mode():
    return os.environ.get("DYAD_APP_MODE") == "viewer"

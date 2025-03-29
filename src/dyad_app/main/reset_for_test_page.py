import logging
import os

import mesop as me
from dyad.settings.user_settings import reset_user_settings
from dyad.settings.workspace_settings import reset_workspace_settings
from dyad.storage.db import drop_all_tables


@me.stateclass
class ResetTestState:
    is_ready: bool = False


def on_load(e: me.LoadEvent):
    if os.environ["DYAD_TESTING"] != "true":
        raise Exception("This page is only for testing purposes.")
    # Just stop the log spam from grpc
    logging.getLogger("grpc").setLevel(logging.FATAL)
    drop_all_tables()
    reset_user_settings()
    reset_workspace_settings()
    # Comment this out because it's slow and doesn't affect
    # most tests.
    # clear_cache_and_restart()
    me.state(ResetTestState).is_ready = True


@me.page(path="/reset-for-test", on_load=on_load)
def reset_for_test_page():
    if me.state(ResetTestState).is_ready:
        me.text("reset-state-ready")
    else:
        me.text("not ready")

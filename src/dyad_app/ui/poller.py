import os
import time

import mesop as me
from dyad.status.status_tracker import status_tracker

from dyad_app.ui.state import State


def poll_status():
    state = me.state(State)
    previous_status = None
    if os.environ.get("DYAD_DISABLE_STATUS_POLLER") == "true":
        return

    while True:
        current_status = status_tracker().get_statuses()

        # Only update state and yield if status has changed
        if current_status != previous_status:
            state.status_by_type = current_status
            previous_status = current_status
            yield

        time.sleep(0.5)  # Sleep before next check

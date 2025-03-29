import sys

import mesop as me
import mesop.bin.bin as mesop_bin
from dyad import logger as logger
from dyad_app import main as main

logger().info("Using Mesop version: %s", me.__version__)
# TODO: start file indexing

# TODO(wwwillchen): come up with a better hot reloading solution.
# This is a hack to get hot reloading to work because the dyad imports
# do not match with the direct file paths that mesop expects due to the
# workspace layout configured by uv.
for mod in sys.modules:
    if (
        (
            mod.startswith("dyad")
            and all(
                [
                    stateful_module not in mod
                    for stateful_module in [
                        "dyad_fs_watcher",
                        "suggestions",
                        "logging",
                        "dyad.agents",
                        "agents",
                        "agent_api",
                    ]
                ]
            )
        )
        or mod.startswith("sqlalchemy")
        or mod.startswith("sqlmodel")
    ):
        mesop_bin.app_modules.add(mod)

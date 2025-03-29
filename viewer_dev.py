import sys

import mesop.bin.bin as mesop_bin
from dyad_app.viewer import view_page as view_page

# https://gist.github.com/wwwillchen/501aa5c17f8fe98058dca9431b1a0ea1

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

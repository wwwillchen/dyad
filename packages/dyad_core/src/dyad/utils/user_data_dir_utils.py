# This file is copied to packages/dyad_cli/src/dyad_cli/user_data_dir_utils.py
# Keep it exactly in sync!
# This is because dyad_core and and dyad_cli can *NOT* have any dependencies
# on each other.
import os
import sys


def get_user_data_dir():
    """
    Determine the appropriate directory for dyad CLI data based on the operating system.

    Returns:
        str: Path to the dyad directory.
    Raises:
        OSError: If the operating system is not supported.
    """
    DYAD_USER_DATA_DIR = os.getenv("DYAD_USER_DATA_DIR")
    if DYAD_USER_DATA_DIR:
        return DYAD_USER_DATA_DIR
    if sys.platform == "darwin":  # MacOS
        return os.path.join(
            os.path.expanduser("~"), "Library", "Application Support", "dyad"
        )
    elif sys.platform == "win32":  # Windows
        return os.path.join(os.environ["APPDATA"], "dyad")
    elif sys.platform.startswith("linux"):  # Linux
        if os.environ.get("XDG_DATA_HOME"):
            return os.path.join(os.environ["XDG_DATA_HOME"], "dyad")
        return os.path.join(os.path.expanduser("~"), ".config", "dyad")
    else:
        print("Did not detect platform! Defaulting to Linux behavior")
        return os.path.join(os.path.expanduser("~"), ".config", "dyad")


def get_extensions_requirements_path():
    return os.path.join(get_user_data_dir(), "extensions", "requirements.txt")

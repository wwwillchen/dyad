import os

from filelock import FileLock
from pydantic import BaseModel

from dyad.workspace_util import get_workspace_storage_path


class Prompt(BaseModel):
    content: str = ""


class WorkspaceSettings(BaseModel):
    ignore_files_enabled: bool = True
    last_agent_used: str = ""
    pads_glob_path: str = "pads/**/*.md"

    def save(self):
        settings_path = _get_settings_path()
        os.makedirs(os.path.dirname(settings_path), exist_ok=True)
        lock = FileLock(_get_lock_path())
        with lock:
            with open(settings_path, "w") as f:
                f.write(self.model_dump_json())


def _get_settings_path() -> str:
    return get_workspace_storage_path("workspace_settings.json")


def _get_lock_path() -> str:
    return _get_settings_path() + ".lock"


def get_workspace_settings() -> WorkspaceSettings:
    settings_path = _get_settings_path()
    lock = FileLock(_get_lock_path())
    with lock:
        if os.path.exists(settings_path):
            with open(settings_path) as f:
                return WorkspaceSettings.model_validate_json(f.read())
    return WorkspaceSettings()


def reset_workspace_settings():
    """Reset workspace settings to default values by removing the settings file.

    Returns:
        WorkspaceSettings: A new WorkspaceSettings instance with default values
    """
    settings_path = _get_settings_path()
    lock = FileLock(_get_lock_path())

    with lock:
        if os.path.exists(settings_path):
            try:
                os.remove(settings_path)
            except OSError as e:
                raise OSError(
                    "Failed to remove workspace settings file:"
                ) from e

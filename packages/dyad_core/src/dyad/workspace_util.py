import os

from dyad.constants import WORKSPACE_DATA_FOLDER_NAME


def does_workspace_file_exist(file_path: str) -> bool:
    full_path = os.path.join(get_workspace_root_path(), file_path)
    return os.path.exists(full_path)


def read_workspace_file(file_path: str) -> str:
    with open(os.path.join(get_workspace_root_path(), file_path)) as f:
        code = f.read()
        return code


def get_workspace_path(file_path: str = ".") -> str:
    return os.path.join(get_workspace_root_path(), file_path)


def get_workspace_storage_dir() -> str:
    return os.path.join(get_workspace_root_path(), WORKSPACE_DATA_FOLDER_NAME)


def get_workspace_storage_path(file_path: str) -> str:
    return os.path.join(get_workspace_storage_dir(), file_path)


def get_workspace_root_path() -> str:
    root_path = os.environ["DYAD_WORKSPACE_DIR"]
    if not root_path:
        raise ValueError("DYAD_WORKSPACE_DIR is not set")
    return os.path.abspath(root_path)


def is_path_within_workspace(file_path: str) -> bool:
    """Check if a given path would be within the workspace directory."""
    workspace_root = get_workspace_root_path()
    # Get absolute path of the target file
    abs_file_path = os.path.abspath(os.path.join(workspace_root, file_path))
    # Check if this path is under workspace root
    return abs_file_path.startswith(workspace_root)

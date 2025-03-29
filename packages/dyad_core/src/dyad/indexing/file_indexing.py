import json
import os
import threading
import time
from pathlib import Path

from pathspec import PathSpec

from dyad import logger
from dyad.indexing.file_update import FileUpdate
from dyad.indexing.semantic_search_store import (
    maybe_get_semantic_search_store,
)
from dyad.settings.workspace_settings import get_workspace_settings
from dyad.status.status import Status
from dyad.status.status_tracker import status_tracker
from dyad.storage.checkpoint.file_checkpoint import cleanup_old_checkpoints
from dyad.storage.models.pad import clean_up_orphaned_pads, sync_file_as_pad
from dyad.suggestions import add_suggestion, remove_suggestion
from dyad.workspace_util import (
    get_workspace_root_path,
    get_workspace_storage_dir,
)

PREFIX = "./"

CACHE_FILENAME = "file_index_cache.json"


class GitAwareFileHandler:
    def __init__(self, index: "FileIndex"):
        self.index = index
        self.workspace_root = get_workspace_root_path()
        self.spec = get_ignore_specs(self.workspace_root)
        self.semantic_store = maybe_get_semantic_search_store()

    def process_changes(self, changes):
        from watchfiles import Change

        updates = []
        for change_type, filepath in changes:
            relative_path = os.path.relpath(filepath, self.workspace_root)

            # Check if the file or any parent directory starts with a dot
            path_parts = relative_path.split(os.sep)
            if any(part.startswith(".") for part in path_parts):
                continue

            if not self.spec.match_file(relative_path):
                # Note: we may receive an added and deleted event for the same file
                # out of order, so we need to check the file existence to be sure.
                if change_type in [
                    Change.added,
                    Change.modified,
                ] and os.path.isfile(filepath):
                    mtime = os.path.getmtime(filepath)
                    self.index.add_file(filepath)
                    updates.append(
                        FileUpdate(
                            file_path=relative_path,
                            type="edit",
                            modified_timestamp=mtime,
                        )
                    )
                    # Add pad processing here
                    process_file_for_pads(relative_path)
                elif change_type == Change.deleted and not os.path.isfile(
                    filepath
                ):
                    self.index.remove_file(filepath)
                    updates.append(
                        FileUpdate(
                            file_path=relative_path,
                            type="delete",
                            modified_timestamp=time.time(),
                        )
                    )

        if updates and self.semantic_store:
            self.semantic_store.process_updates(updates)


class FileIndex:
    def __init__(self, cache_path: str):
        self.files: dict[str, float] = {}  # {filepath: modification_time}
        self.cache_path = cache_path
        self.lock = threading.Lock()

    def load_cache(self):
        if not os.path.exists(self.cache_path):
            logger().info("No cache file found. Starting fresh indexing.")
            return

        try:
            with open(self.cache_path) as f:
                data = json.load(f)
                with self.lock:
                    for k, v in data.get("files", {}).items():
                        self.files[k] = v
                        add_suggestion("file", _relative_filepath(k))
            status_tracker().enqueue(
                Status("Loaded file index from cache", type="indexing")
            )
            logger().info(f"Loaded {len(self.files)} files from cache.")
        except Exception as e:
            logger().error(f"Failed to load cache: {e}")
            self.files = {}

    def save_cache(self):
        try:
            with self.lock:
                data = {"files": self.files}
            os.makedirs(os.path.dirname(self.cache_path), exist_ok=True)
            with open(self.cache_path, "w") as f:
                json.dump(data, f)
            logger().info(f"Saved {len(self.files)} files to cache.")
        except Exception as e:
            logger().error(f"Failed to save cache: {e}")

    def add_file(self, filepath: str):
        mtime = os.path.getmtime(filepath)
        self.files[filepath] = mtime
        add_suggestion("file", _relative_filepath(filepath), mtime)
        self.save_cache()

    def remove_file(self, filepath: str):
        if filepath in self.files:
            del self.files[filepath]
        remove_suggestion("file", _relative_filepath(filepath))
        self.save_cache()

    @staticmethod
    def _should_include_file(file_path: Path) -> bool:
        """
        Determines if a file should be included based on filtering rules.

        Args:
            file_path: Path object representing the file path

        Returns:
            bool: True if the file should be included, False if it should be filtered out
        """
        # Skip files in dot-directories or starting with dot
        if any(part.startswith(".") for part in file_path.parts):
            return False

        # Skip lock files
        if file_path.suffix == ".lock":
            return False
        # return false for image files
        if file_path.suffix in [
            ".png",
            ".jpg",
            ".jpeg",
            ".gif",
            ".bmp",
            ".ico",
        ]:
            return False

        # Handle JSON files - only allow package.json
        return not (
            file_path.suffix == ".json" and file_path.name != "package.json"
        )

    @staticmethod
    def _should_include_directory(dir_path: Path) -> bool:
        """
        Determines if a directory should be included based on filtering rules.

        Args:
            dir_path: Path object representing the directory path

        Returns:
            bool: True if the directory should be included, False if it should be filtered out
        """
        return not any(part.startswith(".") for part in dir_path.parts)

    def index_directory(self, path: str):
        """
        Perform a full indexing of the directory. This method will:
        - Add new and modified files to the index.
        - Remove files from the index that no longer exist in the filesystem.
        - Filter files based on shared filtering rules:
          * Excludes files in dot-directories
          * Excludes lock files
          * Excludes json files (except package.json)
          * Respects .gitignore rules
        """
        spec = get_ignore_specs(path)
        temp_files = {}

        for root, dirs, files in os.walk(path):
            root_path = Path(root)
            dirs[:] = [
                d for d in dirs if self._should_include_directory(root_path / d)
            ]

            for file in files:
                file_path = root_path / file

                if not self._should_include_file(file_path):
                    continue

                filepath_str = str(file_path)
                relative_path = os.path.relpath(filepath_str, path)

                if not spec.match_file(relative_path):
                    try:
                        mtime = os.path.getmtime(filepath_str)
                        temp_files[filepath_str] = mtime
                        # Add pad processing here
                        process_file_for_pads(relative_path)
                    except FileNotFoundError:
                        # The file might have been deleted between os.walk and os.path.getmtime
                        continue

        with self.lock:
            current_files = set(self.files.keys())
            new_files = set(temp_files.keys())

            # Identify and remove deleted files
            removed_files = current_files - new_files
            for filepath in removed_files:
                del self.files[filepath]
                remove_suggestion("file", _relative_filepath(filepath))

            # Add or update existing files
            for filepath, mtime in temp_files.items():
                add_suggestion("file", _relative_filepath(filepath), mtime)
                self.files[filepath] = mtime

        clean_up_orphaned_pads()


def _relative_filepath(filepath: str) -> str:
    return os.path.relpath(filepath, get_workspace_root_path())


def get_ignore_specs(root_path: str) -> PathSpec:
    """Create a PathSpec object from .gitignore and .dyadignore files."""
    ignore_patterns = []

    # Read .gitignore
    gitignore_file = os.path.join(root_path, ".gitignore")
    if os.path.exists(gitignore_file):
        with open(gitignore_file) as f:
            ignore_patterns.extend(f.readlines())

    # Read .dyadignore if enabled
    if get_workspace_settings().ignore_files_enabled:
        dyadignore_file = os.path.join(root_path, ".dyadignore")
        if os.path.exists(dyadignore_file):
            with open(dyadignore_file) as f:
                ignore_patterns.extend(f.readlines())

    # Always ignore .git directory
    return PathSpec.from_lines("gitignore", ignore_patterns)


def process_file_for_pads(file_path: str) -> None:
    """
    Process a file to determine if it should be synced as a pad based on workspace settings.

    Args:
        file_path: The relative path to the file within the workspace
    """

    try:
        settings = get_workspace_settings()
        if not settings.pads_glob_path:
            return
        spec = PathSpec.from_lines("gitignore", [settings.pads_glob_path])
        is_pad = spec.match_file(file_path)
        if is_pad:
            logger().debug(
                f"File {file_path} matches pad glob pattern, syncing as pad"
            )
            sync_file_as_pad(file_path)
    except Exception as e:
        logger().error(f"Error processing file for pads: {e}")


def start_watching():
    watch_files()


_has_activated = False
_current_watcher_thread = None  # Track the current watcher thread
_stop_watching = False  # Flag to control the watch loop


def watch_files():
    global _stop_watching
    workspace_root = get_workspace_root_path()
    storage_dir = get_workspace_storage_dir()
    cache_path = os.path.join(storage_dir, CACHE_FILENAME)
    index = FileIndex(cache_path)
    semantic_store = maybe_get_semantic_search_store()

    # Load cache if available
    index.load_cache()

    handler = GitAwareFileHandler(index)

    def full_indexing():
        logger().info("Starting full indexing...")
        start_time = time.time()

        # Store the previous state with modification times
        previous_files = index.files.copy()  # Now a dict of filepath: mtime

        # Perform the indexing
        index.index_directory(workspace_root)

        # Calculate changes and create updates
        current_files = set(index.files.keys())
        prev_files_set = set(previous_files.keys())
        removed_files = prev_files_set - current_files

        # Create updates list
        updates = []

        for filepath in current_files:
            relative_path = _relative_filepath(filepath)
            updates.append(
                FileUpdate(
                    file_path=relative_path,
                    type="edit",
                    modified_timestamp=index.files[filepath],
                )
            )

        # Add removed files
        for filepath in removed_files:
            relative_path = _relative_filepath(filepath)
            updates.append(
                FileUpdate(
                    file_path=relative_path,
                    type="delete",
                    modified_timestamp=time.time(),
                )
            )

        # Process updates through semantic store
        if updates and semantic_store:
            semantic_store.process_updates(updates)

        end_time = time.time()
        elapsed_time = end_time - start_time
        logger().info(
            f"Indexed {len(index.files)} files in {elapsed_time:.2f} seconds"
        )
        index.save_cache()
        status_tracker().enqueue(Status("✓", type="indexing"))
        logger().info("Full indexing completed and cache updated.")

        cleanup_old_checkpoints()

    # Start full indexing in a separate thread
    indexing_thread = threading.Thread(target=full_indexing)
    indexing_thread.daemon = True
    indexing_thread.start()

    from watchfiles import Change, watch

    def filter_dotfiles(change: Change, path: str):
        """
        Returns True if the path should be watched, False otherwise.
        """
        p = Path(path)
        return FileIndex._should_include_file(p)

    try:
        for changes in watch(
            workspace_root,
            recursive=True,
            watch_filter=filter_dotfiles,
        ):
            if _stop_watching:
                break
            handler.process_changes(changes)
    except Exception as e:
        logger().error(f"Watch process stopped due to error: {e}")
    finally:
        logger().info("Watch process terminated")


def activate():
    global _has_activated, _current_watcher_thread, _stop_watching
    if _has_activated:
        return
    _has_activated = True
    _stop_watching = False
    status_tracker().enqueue(
        Status("Activating file watching...", in_progress=True, type="indexing")
    )
    logger().info("Activating file watching...")
    # Start the observer in a new thread
    _current_watcher_thread = threading.Thread(target=start_watching)
    _current_watcher_thread.daemon = True
    _current_watcher_thread.start()


def clear_cache_and_restart():
    """
    Clears the file index cache and restarts the indexing process.
    This function will:
    1. Stop the current file watcher thread
    2. Delete the cache file
    3. Clear the semantic search store
    4. Restart the file watching and indexing process
    """
    global _has_activated, _current_watcher_thread, _stop_watching

    logger().info("Clearing cache and restarting indexing...")

    # Stop the current watcher thread if it exists
    if _current_watcher_thread and _current_watcher_thread.is_alive():
        logger().info("Stopping current file watcher...")
        _stop_watching = True
        _current_watcher_thread.join(
            timeout=5
        )  # Wait up to 5 seconds for thread to stop
        if _current_watcher_thread.is_alive():
            logger().warning("File watcher thread did not stop gracefully")

    # Reset the activation flag
    _has_activated = False
    _current_watcher_thread = None

    # Get cache file path
    storage_dir = get_workspace_storage_dir()
    cache_path = os.path.join(storage_dir, CACHE_FILENAME)

    # Delete the cache file if it exists
    if os.path.exists(cache_path):
        try:
            os.remove(cache_path)
            logger().info("Cache file deleted successfully")
        except Exception as e:
            logger().error(f"Error deleting cache file: {e}")

    # Clear the semantic search store
    semantic_store = maybe_get_semantic_search_store()
    if semantic_store:
        semantic_store.clear()

    # Restart the indexing process
    activate()

    logger().info("File indexing has been restarted with a fresh cache")

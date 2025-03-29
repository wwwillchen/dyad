"""
Manages file checkpoints for Dyad workspaces, providing functionality to create and restore
file backups with timestamps. Enables version control and recovery of workspace files.
"""

import os
import shutil
from datetime import datetime, timedelta

from dyad.apply_code import ApplyCodeCandidate
from dyad.logging.logging import logger
from dyad.public.chat_message import FileCheckpoint
from dyad.workspace_util import (
    get_workspace_path,
    get_workspace_storage_path,
    is_path_within_workspace,
    read_workspace_file,
)

TIME_FORMAT = "%Y%m%d_%H%M%S_%f"


def create_candidate_from_checkpoint(
    file_revision: FileCheckpoint,
) -> ApplyCodeCandidate:
    """
    Creates an ApplyCodeCandidate from a FileRevision checkpoint.

    Args:
        file_revision: FileRevision object containing the original path and checkpoint path

    Returns:
        ApplyCodeCandidate object representing the code changes from the checkpoint

    Raises:
        FileNotFoundError: If either the original or checkpoint file doesn't exist
        ValueError: If file paths are not within workspace
    """
    # Validate the file paths are within workspace
    if not is_path_within_workspace(file_revision.original_path):
        raise ValueError(
            f"Original file path {file_revision.original_path} must be within workspace"
        )

    # Ensure checkpoint file exists
    if not os.path.exists(file_revision.checkpoint_path):
        raise FileNotFoundError(
            f"Checkpoint file {file_revision.checkpoint_path} not found"
        )

    # Read the original file content
    try:
        before_code = read_workspace_file(file_revision.original_path)
    except FileNotFoundError:
        before_code = ""  # Handle case where original file doesn't exist yet

    # Read the checkpoint file content
    with open(file_revision.checkpoint_path) as f:
        checkpoint_content = f.read()

    # Create ApplyCodeCandidate with both the original and checkpoint content
    return ApplyCodeCandidate(
        file_path=file_revision.original_path,
        before_code=before_code,
        after_code=checkpoint_content or "[file-will-be-deleted]",
        final_code=checkpoint_content
        or "[file-will-be-deleted]",  # The checkpoint content becomes the final code
        error_message=None,
    )


def use_checkpoint(file_revision: FileCheckpoint) -> None:
    """
    Restores a file from a checkpoint by copying the checkpoint file back to its original location.
    If the checkpoint file is empty, deletes the target file instead of copying.
    After successful restoration, deletes the checkpoint file since it won't be needed again.

    Args:
        file_revision: FileRevision object containing the original path and checkpoint path

    Raises:
        ValueError: If file paths are not within workspace
        FileNotFoundError: If checkpoint file doesn't exist
    """
    # Validate the file paths are within workspace
    if not is_path_within_workspace(file_revision.original_path):
        raise ValueError(
            f"Original file path {file_revision.original_path} must be within workspace"
        )

    # Ensure checkpoint file exists
    if not os.path.exists(file_revision.checkpoint_path):
        raise FileNotFoundError(
            f"Checkpoint file {file_revision.checkpoint_path} not found"
        )

    # Check if checkpoint file is empty
    with open(file_revision.checkpoint_path) as f:
        content = f.read()

    target_path = get_workspace_path(file_revision.original_path)

    try:
        if not content.strip():  # If checkpoint is empty
            # Delete the target file if it exists
            if os.path.exists(target_path):
                os.remove(target_path)
                logger().info(
                    f"Deleted {file_revision.original_path} as checkpoint was empty"
                )
        else:
            # For non-empty checkpoints, proceed with normal copy
            # Create directory structure for original file if it doesn't exist
            original_dir = os.path.dirname(target_path)
            os.makedirs(original_dir, exist_ok=True)

            # Copy checkpoint file back to original location
            shutil.copy2(
                file_revision.checkpoint_path,
                target_path,
            )
            logger().info(
                f"Successfully restored checkpoint for {file_revision.original_path} from {file_revision.checkpoint_path}"
            )

        # Delete the checkpoint file after successful restoration
        os.remove(file_revision.checkpoint_path)
        logger().info(
            f"Deleted used checkpoint file: {file_revision.checkpoint_path}"
        )

    except Exception as e:
        logger().error(f"Failed to restore checkpoint: {e}")
        raise


def create_checkpoint(file_path: str) -> FileCheckpoint:
    """
    Creates a checkpoint of a workspace file by copying it to a checkpoint directory.
    If the file doesn't exist yet, creates an empty checkpoint.

    Args:
        file_path: Relative path to the file within the workspace

    Returns:
        FileRevision: Object containing the original path, checkpoint path and timestamp

    Raises:
        ValueError: If file_path is not within workspace or if file is too large (>1MB)
    """
    # Define max file size constant (1MB)
    MAX_FILE_SIZE = 1024 * 1024  # 1MB in bytes

    # Validate the file path is within workspace
    if not is_path_within_workspace(file_path):
        raise ValueError(f"File path {file_path} must be within workspace")

    # Check file size if file exists
    full_path = get_workspace_path(file_path)
    if os.path.exists(full_path):
        file_size = os.path.getsize(full_path)
        if file_size > MAX_FILE_SIZE:
            raise ValueError(
                f"File {file_path} is too large ({file_size / 1024 / 1024:.1f}MB). "
                f"Checkpointing is not supported for files larger than {MAX_FILE_SIZE / 1024 / 1024:.1f}MB"
            )

    now = datetime.now()
    timestamp = now.strftime(TIME_FORMAT)

    checkpoint_dir = get_workspace_storage_path("checkpoints")
    os.makedirs(checkpoint_dir, exist_ok=True)

    file_dir = os.path.dirname(file_path)
    checkpoint_file_dir = os.path.join(checkpoint_dir, file_dir)
    os.makedirs(checkpoint_file_dir, exist_ok=True)

    file_name = os.path.basename(file_path)
    checkpoint_file_name = f"{file_name}.{timestamp}"
    checkpoint_path = os.path.join(checkpoint_file_dir, checkpoint_file_name)

    try:
        content = read_workspace_file(file_path)
    except FileNotFoundError:
        content = ""
        logger().info(f"Creating empty checkpoint for new file: {file_path}")

    with open(checkpoint_path, "w") as f:
        f.write(content)

    return FileCheckpoint(
        original_path=file_path,
        checkpoint_path=checkpoint_path,
        timestamp=now,
    )


def cleanup_old_checkpoints(max_age_hours: int = 72) -> None:
    """
    Cleans up checkpoint files that are older than the specified age.

    Args:
        max_age_hours: Maximum age of checkpoint files in hours (default: 72)
    """
    checkpoint_dir = get_workspace_storage_path("checkpoints")
    if not os.path.exists(checkpoint_dir):
        logger().debug(f"Checkpoint directory does not exist: {checkpoint_dir}")
        return

    cutoff_time = datetime.now() - timedelta(hours=max_age_hours)
    files_deleted = 0

    for root, _, files in os.walk(checkpoint_dir):
        for filename in files:
            file_path = os.path.join(root, filename)
            try:
                # Get the timestamp from the filename (assumes format ending in .YYYYMMDD_HHMMSS)
                timestamp_str = filename.split(".")[-1]
                file_time = datetime.strptime(timestamp_str, TIME_FORMAT)

                if file_time < cutoff_time:
                    os.remove(file_path)
                    files_deleted += 1
                    logger().debug(f"Deleted old checkpoint file: {file_path}")

                    # If directory is empty after file deletion, remove it
                    parent_dir = os.path.dirname(file_path)
                    if not os.listdir(parent_dir):
                        os.rmdir(parent_dir)
                        logger().debug(
                            f"Removed empty checkpoint directory: {parent_dir}"
                        )

            except (ValueError, IndexError) as e:
                logger().warning(
                    f"Failed to parse timestamp for file {file_path}: {e}"
                )
                continue
            except OSError as e:
                logger().error(
                    f"Failed to delete checkpoint file {file_path}: {e}"
                )
                continue

    logger().info(
        f"Checkpoint cleanup completed: {files_deleted} files deleted"
    )

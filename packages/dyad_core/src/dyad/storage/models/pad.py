import os
import uuid
from datetime import datetime
from typing import cast

import frontmatter
from sqlalchemy import not_
from sqlmodel import Field, Session, SQLModel, select

from dyad.logging.logging import logger
from dyad.pad import (
    GlobSelectionCriteria,
    Pad,
    SelectionCriteria,
    SelectionInstructionCriteria,
)
from dyad.storage.db import engine
from dyad.workspace_util import get_workspace_path, is_path_within_workspace


class PadModel(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    content: str
    type: str
    glob_pattern: str | None = None
    selection_instruction: str | None = None
    file_path: str | None = None
    created_at: datetime = Field(
        default_factory=lambda: datetime.now().astimezone(), nullable=False
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now().astimezone(), nullable=False
    )


def get_pads_with_glob_pattern() -> list[Pad]:
    with Session(engine) as session:
        statement = select(PadModel).where(
            not_(PadModel.glob_pattern.is_(None))  # type: ignore
        )
        models = session.exec(statement).all()
        return [
            Pad(
                id=model.id,
                title=model.title,
                content=model.content,
                type=model.type,
                complete=True,
                selection_criteria=get_selection_criteria(model),
            )
            for model in models
        ]


def get_pads_with_selection_instruction() -> list[Pad]:
    with Session(engine) as session:
        statement = select(PadModel).where(
            not_(PadModel.selection_instruction.is_(None))  # type: ignore
        )
        models = session.exec(statement).all()
        return [
            Pad(
                id=model.id,
                title=model.title,
                content=model.content,
                type=model.type,
                complete=True,
                selection_criteria=get_selection_criteria(model),
            )
            for model in models
        ]


def get_pads(n: int = 100) -> list[Pad]:
    with Session(engine) as session:
        statement = (
            select(PadModel).order_by(PadModel.updated_at.desc()).limit(n)  # type: ignore
        )
        models = session.exec(statement).all()
        return [
            Pad(
                id=model.id,
                title=get_title_from_model(model),
                content=model.content,
                type=model.type,
                complete=True,
                selection_criteria=get_selection_criteria(model),
                file_path=model.file_path,
            )
            for model in models
        ]


def get_title_from_model(model: PadModel) -> str:
    if model.file_path:
        try:
            workspace_path = get_workspace_path(model.file_path)
            with open(workspace_path) as f:
                post = frontmatter.load(f)
                return str(post.metadata.get("title", model.title))
        except Exception as e:
            logger().warning(
                f"Failed to read title from frontmatter in {model.file_path}: {e}"
            )
    return model.title


def get_selection_criteria_from_frontmatter(
    metadata: dict,
) -> SelectionCriteria | None:
    if "globs" in metadata:
        return GlobSelectionCriteria(
            type="glob", glob_pattern=metadata["globs"]
        )
    if "selection_instruction" in metadata:
        return SelectionInstructionCriteria(
            type="selection_instruction",
            selection_instruction=metadata["selection_instruction"],
        )
    return None


def get_selection_criteria(model: PadModel) -> SelectionCriteria | None:
    if model.file_path:
        try:
            workspace_path = get_workspace_path(model.file_path)
            with open(workspace_path) as f:
                post = frontmatter.load(f)
                return get_selection_criteria_from_frontmatter(post.metadata)
        except Exception as e:
            logger().warning(
                f"Failed to read frontmatter from {model.file_path}: {e}"
            )

    if model.glob_pattern:
        return GlobSelectionCriteria(
            type="glob", glob_pattern=model.glob_pattern
        )
    if model.selection_instruction:
        return SelectionInstructionCriteria(
            type="selection_instruction",
            selection_instruction=model.selection_instruction,
        )
    return None


def get_pad(pad_id: str) -> Pad | None:
    with Session(engine) as session:
        statement = select(PadModel).where(PadModel.id == pad_id)
        model = session.exec(statement).first()
        if model is None:
            return None

        content = model.content
        title = model.title
        if model.file_path:
            try:
                workspace_path = get_workspace_path(model.file_path)
                with open(workspace_path) as f:
                    post = frontmatter.load(f)
                    content = post.content
                    title = str(post.metadata.get("title", model.title))
            except (OSError, FileNotFoundError) as e:
                logger().warning(
                    f"Failed to read contents from file {model.file_path}: {e}"
                )
                content = "ERROR: could not read from file " + model.file_path

        return Pad(
            id=model.id,
            title=title,
            content=content,
            complete=True,
            file_path=model.file_path,
            selection_criteria=get_selection_criteria(model),
            type=model.type,
        )


def delete_pad(pad_id: str):
    with Session(engine) as session:
        pad = session.get(PadModel, pad_id)
        if pad:
            if pad.file_path:
                workspace_path = get_workspace_path(pad.file_path)
                try:
                    if os.path.exists(workspace_path):
                        os.remove(workspace_path)
                except Exception as e:
                    logger().warning(
                        f"Failed to delete file {workspace_path}: {e}"
                    )
            session.delete(pad)
            session.commit()
        else:
            logger().warning(f"Pad with id {pad_id} not found.")


def save_pad(pad: Pad):
    glob_pattern = None
    selection_instruction = None
    frontmatter_metadata = {}

    if pad.file_path and not is_path_within_workspace(pad.file_path):
        raise ValueError("File path must be within workspace directory")

    if pad.selection_criteria:
        if isinstance(pad.selection_criteria, GlobSelectionCriteria):
            glob_pattern = pad.selection_criteria.glob_pattern
            frontmatter_metadata["globs"] = glob_pattern
        if isinstance(pad.selection_criteria, SelectionInstructionCriteria):
            selection_instruction = pad.selection_criteria.selection_instruction
            frontmatter_metadata["selection_instruction"] = (
                selection_instruction
            )

    logger().info(f"Saving pad with id {pad.id}")
    if pad.file_path:
        workspace_path = get_workspace_path(pad.file_path)
        logger().debug("Saving pad with file path: " + workspace_path)
        os.makedirs(os.path.dirname(workspace_path), exist_ok=True)

        frontmatter_metadata["title"] = pad.title
        post = frontmatter.Post(pad.content, **frontmatter_metadata)
        with open(workspace_path, "w") as f:
            f.write(frontmatter.dumps(post))

    with Session(engine) as session:
        existing_model = session.get(PadModel, pad.id)

        if existing_model:
            existing_model.title = pad.title
            existing_model.content = pad.content
            if (
                existing_model.file_path != pad.file_path
                and existing_model.file_path
            ):
                try:
                    os.remove(get_workspace_path(existing_model.file_path))
                except Exception as e:
                    logger().warning(
                        f"Failed to delete file {existing_model.file_path}: {e}"
                    )
            existing_model.file_path = pad.file_path
            existing_model.updated_at = datetime.now().astimezone()
            existing_model.glob_pattern = (
                glob_pattern if not pad.file_path else None
            )
            existing_model.selection_instruction = (
                selection_instruction if not pad.file_path else None
            )

        else:
            assert pad.id is not None
            model = PadModel(
                id=pad.id,
                title=pad.title,
                type=pad.type,
                content=pad.content,
                file_path=pad.file_path,
                glob_pattern=glob_pattern if not pad.file_path else None,
                selection_instruction=selection_instruction
                if not pad.file_path
                else None,
            )
            session.add(model)

        session.commit()


def sync_file_as_pad(file_path: str) -> None:
    """
    Syncs a file as a pad in the database. If the pad doesn't exist, creates it.
    If it exists, updates it. Handles selection criteria from frontmatter.

    Args:
        file_path: The relative path to the file within the workspace
    """
    with Session(engine) as session:
        # Check if pad already exists with this file path
        statement = select(PadModel).where(PadModel.file_path == file_path)
        existing_pad = session.exec(statement).first()

        try:
            workspace_path = get_workspace_path(file_path)
            with open(workspace_path) as f:
                post = frontmatter.load(f)
                title = str(post.metadata.get("title", file_path))

                # Extract selection criteria from frontmatter
                glob_pattern = None
                selection_instruction = None
                if "globs" in post.metadata:
                    glob_pattern = cast(str, post.metadata["globs"])
                if "selection_instruction" in post.metadata:
                    selection_instruction = cast(
                        str, post.metadata["selection_instruction"]
                    )

            if existing_pad:
                # Update existing pad
                existing_pad.title = title
                existing_pad.glob_pattern = glob_pattern
                existing_pad.selection_instruction = selection_instruction
                existing_pad.updated_at = datetime.now().astimezone()
                logger().debug(f"Updated existing pad for file: {file_path}")
            else:
                # Create new pad
                new_pad = PadModel(
                    id=str(uuid.uuid4()),
                    title=title,
                    type="text/markdown",
                    file_path=file_path,
                    content="",
                    glob_pattern=glob_pattern,
                    selection_instruction=selection_instruction,
                )
                session.add(new_pad)
                logger().info(f"Created new pad for file: {file_path}")

            session.commit()

        except Exception as e:
            logger().error(f"Failed to sync file as pad {file_path}: {e}")
            session.rollback()


def clean_up_orphaned_pads() -> int:
    """
    Deletes all pads from the database that have a file_path but the actual file
    doesn't exist in the workspace.

    Returns:
        int: Number of orphaned pads that were deleted
    """
    deleted_count = 0
    with Session(engine) as session:
        # Get all pads with non-null file_paths
        statement = select(PadModel).where(not_(PadModel.file_path.is_(None)))  # type: ignore
        pads_with_files = session.exec(statement).all()

        for pad in pads_with_files:
            try:
                # Safe to assert because of the previous filter
                assert pad.file_path is not None
                workspace_path = get_workspace_path(pad.file_path)
                if not os.path.exists(workspace_path):
                    logger().info(
                        f"Deleting orphaned pad {pad.id} with missing file: {pad.file_path}"
                    )
                    session.delete(pad)
                    deleted_count += 1
            except Exception as e:
                logger().warning(
                    f"Error checking pad {pad.id} with file {pad.file_path}: {e}"
                )

        if deleted_count > 0:
            session.commit()
            logger().info(f"Cleaned up {deleted_count} orphaned pads")

    return deleted_count

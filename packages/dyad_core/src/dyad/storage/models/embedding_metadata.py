from datetime import datetime

from sqlmodel import Field, Session, SQLModel, select

from dyad.settings.user_settings import EmbeddingModelConfig
from dyad.storage.db import engine


class EmbeddingMetadata(SQLModel, table=True):
    """SQLModel for tracking embedding metadata and caching."""

    id: int | None = Field(default=None, primary_key=True)
    file_path: str = Field(index=True)
    branch: str = Field(index=True)
    provider: str = Field(index=True)  # Embedding provider (e.g., "gemini")
    embedding_model_name: str = Field(index=True)  # Embedding model name
    version: str = Field(index=True)
    embedding_dim: int  # Dimension of the embedding vector
    file_hash: str  # Hash of the file contents
    indexed_at: datetime = Field(
        default_factory=lambda: datetime.now().astimezone()
    )
    file_last_modified: datetime  # Timestamp of the file's last modification
    vector_store_id: str  # Reference to LanceDB record ID
    exists_in_branch: bool = Field(default=True)


def get_embedding_metadata(
    file_path: str, branch: str, embedding_model_config: EmbeddingModelConfig
) -> EmbeddingMetadata | None:
    """
    Retrieve embedding metadata for a specific file, branch, and embedder.

    Args:
        file_path: Path to the file
        branch: Git branch name
        embedder_id: EmbedderId instance containing provider, model, and dimension

    Returns:
        EmbeddingMetadata if found, None otherwise
    """
    with Session(engine) as session:
        statement = select(EmbeddingMetadata).where(
            EmbeddingMetadata.file_path == file_path,
            EmbeddingMetadata.branch == branch,
            EmbeddingMetadata.version == embedding_model_config.version,
            EmbeddingMetadata.provider == embedding_model_config.provider_id,
            EmbeddingMetadata.embedding_model_name
            == embedding_model_config.embedding_model_name,
        )
        return session.exec(statement).first()


def upsert_embedding_metadata(
    *,
    file_path: str,
    branch: str,
    embedding_model_config: EmbeddingModelConfig,
    file_hash: str,
    vector_store_id: str,
    file_last_modified: datetime,
) -> EmbeddingMetadata:
    """
    Create or update embedding metadata for a file.

    Args:
        file_path: Path to the file
        branch: Git branch name
        embedder_id: EmbedderId instance containing provider, model, and dimension
        file_hash: Hash of the file contents
        vector_store_id: ID reference in the vector store (LanceDB)
        file_last_modified: Timestamp of the file's last modification

    Returns:
        The created or updated EmbeddingMetadata instance
    """
    with Session(engine) as session:
        # Try to find existing record within the current session
        statement = select(EmbeddingMetadata).where(
            EmbeddingMetadata.file_path == file_path,
            EmbeddingMetadata.branch == branch,
            EmbeddingMetadata.version == embedding_model_config.version,
            EmbeddingMetadata.provider == embedding_model_config.provider_id,
            EmbeddingMetadata.embedding_model_name
            == embedding_model_config.embedding_model_name,
        )
        metadata = session.exec(statement).first()

        if metadata:
            # Update existing record
            metadata.file_hash = file_hash
            metadata.embedding_dim = embedding_model_config.embedding_dim
            metadata.vector_store_id = vector_store_id
            metadata.indexed_at = datetime.now().astimezone()
            metadata.file_last_modified = file_last_modified
            metadata.exists_in_branch = True
        else:
            # Create new record
            metadata = EmbeddingMetadata(
                file_path=file_path,
                branch=branch,
                version=embedding_model_config.version,
                provider=embedding_model_config.provider_id,
                embedding_model_name=embedding_model_config.embedding_model_name,
                embedding_dim=embedding_model_config.embedding_dim,
                file_hash=file_hash,
                vector_store_id=vector_store_id,
                file_last_modified=file_last_modified,
            )
            session.add(metadata)

        session.commit()
        session.refresh(metadata)
        return metadata


def mark_file_removed(file_path: str, branch: str) -> None:
    """
    Mark a file as removed from a branch.

    Args:
        file_path: Path to the file
        branch: Git branch name
    """
    with Session(engine) as session:
        statement = select(EmbeddingMetadata).where(
            EmbeddingMetadata.file_path == file_path,
            EmbeddingMetadata.branch == branch,
        )
        metadata = session.exec(statement).all()

        for record in metadata:
            record.exists_in_branch = False

        session.commit()


def get_stale_embeddings(branch: str) -> list[EmbeddingMetadata]:
    """
    Get all embeddings marked as removed or no longer existing in a branch.

    Args:
        branch: Git branch name

    Returns:
        List of EmbeddingMetadata records that are stale
    """
    with Session(engine) as session:
        statement = select(EmbeddingMetadata).where(
            EmbeddingMetadata.branch == branch,
            EmbeddingMetadata.exists_in_branch == False,  # noqa: E712
        )
        return list(session.exec(statement).all())


def delete_embedding_metadata(metadata_id: int) -> None:
    """
    Permanently delete an embedding metadata record.

    Args:
        metadata_id: ID of the metadata record to delete
    """
    with Session(engine) as session:
        metadata = session.get(EmbeddingMetadata, metadata_id)
        if metadata:
            session.delete(metadata)
            session.commit()


def drop_and_recreate_embedding_metadata_table() -> None:
    """
    Drop the embedding metadata table and recreate it.
    """
    table = EmbeddingMetadata.__table__  # type: ignore
    with Session(engine) as session:
        # Drop only the EmbeddingMetadata table
        table.drop(engine)
        # Recreate only the EmbeddingMetadata table
        table.create(engine)
        session.commit()

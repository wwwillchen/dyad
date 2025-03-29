import hashlib
import logging
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import NamedTuple

from dyad.indexing.embeddings.embedding_provider import (
    get_embedding_models,
    get_embedding_provider,
)
from dyad.indexing.file_extensions import SUPPORTED_TEXT_EXTENSIONS
from dyad.indexing.file_update import FileUpdate
from dyad.indexing.lance_store import (
    LanceEmbeddingStore,
    get_embedding_record_type,
)
from dyad.language_model.language_model_clients import is_provider_setup
from dyad.logging.logging import logger
from dyad.settings.user_settings import get_user_settings
from dyad.storage.models.embedding_metadata import (
    drop_and_recreate_embedding_metadata_table,
    get_embedding_metadata,
    mark_file_removed,
    upsert_embedding_metadata,
)
from dyad.workspace_util import (
    get_workspace_root_path,
    get_workspace_storage_path,
)


class TextChunk(NamedTuple):
    content: str
    start_pos: int
    end_pos: int


class SimpleSplitterFile:
    def __init__(self, chunk_size: int = 1024, overlap_size: int = 200):
        self.chunk_size = chunk_size
        self.overlap_size = overlap_size

    def split_text(self, text: str) -> list[TextChunk]:
        """
        Split text into chunks with overlap.
        Returns a list of TextChunk objects containing the content and position information.
        """
        if not text:
            return []

        chunks = []
        position = 0
        text_length = len(text)

        while position < text_length:
            # Calculate the end position for this chunk
            chunk_end = min(position + self.chunk_size, text_length)

            # Extract the chunk
            chunk_content = text[position:chunk_end]

            # Create a TextChunk with position information
            chunks.append(
                TextChunk(
                    content=chunk_content, start_pos=position, end_pos=chunk_end
                )
            )

            # Move position for next chunk, accounting for overlap
            position = (
                chunk_end - self.overlap_size
                if chunk_end < text_length
                else text_length
            )

        return chunks


class SemanticSearchStore:
    _instance = None

    # Configuration for different file types
    MAX_FILE_SIZE = 1024 * 1024 * 10  # 10MB limit for files
    CHUNK_SIZE = 2000  # Size of each chunk in characters
    OVERLAP_SIZE = 200  # Number of characters to overlap between chunks

    def __new__(cls):
        if cls._instance is None:
            cls._instance = super().__new__(cls)
            cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if self._initialized:
            return

        self.branch = "main"
        self.logger = logging.getLogger(__name__)
        user_settings = get_user_settings()
        embedding_model_config = user_settings.embedding_model_config

        if embedding_model_config is None:
            if is_provider_setup("google-genai"):
                embedding_model_config = get_embedding_models("google-genai")[0]
            elif is_provider_setup("openai"):
                embedding_model_config = get_embedding_models("openai")[0]
            else:
                raise ValueError(
                    "No embedding model configured, please set one in settings"
                )
            logger().info(
                f"No embedding model configured, using {embedding_model_config} and saving to user settings"
            )

            user_settings.embedding_model_config = embedding_model_config
            user_settings.save()
        self.embedding_model_config = embedding_model_config
        self.embedding_provider = get_embedding_provider(
            self.embedding_model_config.provider_id
        )
        self.store = LanceEmbeddingStore(
            db_path=get_workspace_storage_path("embeddings_lance"),
            embedding_model_config=self.embedding_model_config,
        )
        self.workspace_root = Path(get_workspace_root_path())
        self._initialized = True

    def _read_file_content(self, file_path: str) -> list[TextChunk] | None:
        """
        Read and process file content with proper error handling and size checks.
        Returns a list of TextChunks or None if the file cannot be processed.
        """
        full_path = self.workspace_root / file_path

        try:
            if not full_path.exists():
                self.logger.warning(f"File not found: {file_path}")
                return None

            if not full_path.is_file():
                self.logger.warning(f"Not a regular file: {file_path}")
                return None

            if full_path.suffix.lower() not in SUPPORTED_TEXT_EXTENSIONS:
                self.logger.warning(f"Unsupported file type: {file_path}")
                return None

            if full_path.stat().st_size > self.MAX_FILE_SIZE:
                self.logger.warning(f"File too large (>10MB): {file_path}")
                return None

            with full_path.open("r", encoding="utf-8") as f:
                content = f.read()

            # Create a splitter and split the content into chunks
            splitter = SimpleSplitterFile(
                chunk_size=self.CHUNK_SIZE, overlap_size=self.OVERLAP_SIZE
            )
            return splitter.split_text(content)

        except UnicodeDecodeError:
            self.logger.warning(f"Unable to decode file as UTF-8: {file_path}")
            return None
        except Exception as e:
            self.logger.error(f"Error reading file {file_path}: {e!s}")
            return None

    def _compute_file_hash(self, chunks: list[TextChunk]) -> str:
        """Compute a consistent hash of the file content from all chunks."""
        combined_content = "".join(chunk.content for chunk in chunks)
        return hashlib.sha256(combined_content.encode("utf-8")).hexdigest()

    def process_updates(self, updates: list[FileUpdate]):
        self.logger.info(
            f"Processing {len(updates)} file updates for embedding generation"
        )

        updates_to_process = [
            update for update in updates if update.type != "delete"
        ]
        deletes_to_process = [
            update for update in updates if update.type == "delete"
        ]

        # Collect all chunks and metadata up front
        all_chunks = []
        chunk_metadata = []  # Store metadata for each chunk

        for update in updates_to_process:
            chunks = self._read_file_content(update.file_path)
            if chunks is None:
                continue

            content_hash = self._compute_file_hash(chunks)
            self.logger.debug(
                f"Processing file: '{update.file_path}' (hash: {content_hash[:8]}...)"
            )

            metadata = get_embedding_metadata(
                file_path=update.file_path,
                branch=self.branch,
                embedding_model_config=self.embedding_model_config,
            )

            if metadata and metadata.file_hash == content_hash:
                self.logger.debug(
                    f"Content unchanged for {update.file_path}, skipping embedding"
                )
                continue

            # Collect chunks and their metadata
            for i, chunk in enumerate(chunks):
                chunk_id = f"{update.file_path}#chunk_{i}"
                all_chunks.append(chunk.content)
                chunk_metadata.append(
                    {
                        "chunk_id": chunk_id,
                        "file_path": update.file_path,
                        "file_hash": content_hash,
                        "modified_timestamp": update.modified_timestamp,
                        "code": chunk.content,
                    }
                )

        # Process all chunks in batches
        if not all_chunks:
            return

        batch_size = 500  # Adjust based on your needs and API limits
        for i in range(0, len(all_chunks), batch_size):
            batch_chunks = all_chunks[i : i + batch_size]
            batch_metadata = chunk_metadata[i : i + batch_size]

            # Generate embeddings for the batch
            chunk_embeddings = self.embedding_provider.generate_embeddings(
                batch_chunks
            )

            # Create EmbeddingRecords for the batch
            records = [
                get_embedding_record_type(
                    self.embedding_model_config.embedding_dim
                )(
                    file_path=meta["chunk_id"],
                    file_hash=meta["file_hash"],
                    embedding=embedding,
                    code=meta["code"],
                )
                for embedding, meta in zip(
                    chunk_embeddings, batch_metadata, strict=False
                )
            ]

            # Store embeddings in batch
            self.store.add_embeddings(records)
            self.logger.info(f"Stored {len(records)} embeddings in batch")

            # Update metadata for each unique file in this batch
            processed_files = set()
            for meta in batch_metadata:
                if meta["file_path"] not in processed_files:
                    upsert_embedding_metadata(
                        file_path=meta["file_path"],
                        branch=self.branch,
                        embedding_model_config=self.embedding_model_config,
                        file_hash=meta["file_hash"],
                        vector_store_id=meta["file_path"],
                        file_last_modified=datetime.fromtimestamp(
                            meta["modified_timestamp"]
                        ).astimezone(),
                    )
                    processed_files.add(meta["file_path"])
                    self.logger.debug(
                        f"Updated metadata for {meta['file_path']}"
                    )
        for update in deletes_to_process:
            self.store.remove_embedding(file_path=update.file_path)
            mark_file_removed(file_path=update.file_path, branch=self.branch)
            self.logger.debug(f"Removed embedding for {update.file_path}")

    def search(self, query_text: str, top_k: int = 10) -> Iterable[str]:
        self.logger.info(
            f"Performing semantic search for query: '{query_text}' using: %s",
            self.embedding_provider,
        )
        query_embedding = self.embedding_provider.generate_single_embedding(
            query_text
        )

        # LanceDB seems to have a bug where + and - trigger a syntax error
        sanitized_query_text = (
            query_text.replace("+", " ").replace("-", " ").replace(":", " ")
        )
        results = self.store.search_similar_embeddings(
            query_text=sanitized_query_text,
            query_embedding=query_embedding,
            top_k=top_k,
            dim=self.embedding_model_config.embedding_dim,
        )

        # Remove chunk identifiers from paths (everything after #)
        return set(r.file_path.split("#")[0] for r in results)

    def clear(self):
        """
        Clears all embeddings and related data from the store.
        This is useful for resetting the semantic search functionality.
        Also resets the singleton instance and clears embedding metadata.
        """
        self.logger.info("Clearing all embeddings from semantic search store")
        try:
            # Clear the embedding store
            self.store.clear()

            # Drop and recreate the embedding metadata table

            drop_and_recreate_embedding_metadata_table()

            # Reset singleton instance
            SemanticSearchStore._instance = None
            self._initialized = False
            self.logger.info(
                "Successfully cleared semantic search store, metadata, and reset singleton"
            )
        except Exception as e:
            self.logger.error(f"Error clearing semantic search store: {e}")


def semantic_search(*, query: str, limit: int = 10) -> Iterable[str]:
    return SemanticSearchStore().search(query_text=query, top_k=limit)


def is_semantic_search_enabled() -> bool:
    try:
        SemanticSearchStore()
        return True
    except Exception as e:
        logger().debug(f"Error initializing semantic search store: {e}")
        return False


def maybe_get_semantic_search_store() -> SemanticSearchStore | None:
    try:
        return SemanticSearchStore()
    except Exception as e:
        logger().debug(f"Error initializing semantic search store: {e}")
        return None

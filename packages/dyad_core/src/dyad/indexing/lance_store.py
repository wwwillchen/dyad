import logging
import os
import uuid
from typing import Any

from pydantic import Field

from dyad.settings.user_settings import EmbeddingModelConfig

logger = logging.getLogger(__name__)

EmbeddingRecord = Any


def get_embedding_record_type(dim: int):
    from lancedb.pydantic import LanceModel, Vector

    class EmbeddingRecord(LanceModel):
        """
        Pydantic model representing a single embedding record in the LanceDB table.

        Attributes:
            id: Unique identifier for each record
            file_path: Path to the file
            file_hash: Hash of file contents
            embedding: Vector embedding as a list of floats
            code: Full code/text content
        """

        id: str = Field(default_factory=lambda: str(uuid.uuid4()))
        file_path: str
        file_hash: str
        embedding: Vector(dim)  # type: ignore
        code: str

        class Config:
            frozen = True

    return EmbeddingRecord


class LanceEmbeddingStore:
    """
    A simple wrapper around LanceDB for storing file embeddings with ANN search support.
    """

    def __init__(
        self, db_path: str, embedding_model_config: EmbeddingModelConfig
    ):
        import lancedb

        """
        Initialize or open a LanceDB database at the given `db_path` and
        create (or open) a table named based on the embedder_id.
        """
        logger.info(f"Initializing LanceDB at {db_path}")

        # Sanitize embedder_name and model_name to remove unusual characters
        def sanitize(name: str) -> str:
            # Replace any non-alphanumeric characters (except underscores) with underscores
            return "".join(c if c.isalnum() or c == "_" else "_" for c in name)

        sanitized_embedder = sanitize(embedding_model_config.provider_id)
        sanitized_model = sanitize(embedding_model_config.embedding_model_name)

        # Construct table name
        table_name = f"code_embeddings_{sanitized_embedder}_{sanitized_model}_d{embedding_model_config.embedding_dim}_v{embedding_model_config.version}"
        logger.info(f"Using table name: {table_name}")

        # Ensure the directory for db_path exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        logger.info("Ensured database directory exists")

        # Connect to the LanceDB database
        self.db = lancedb.connect(db_path)
        logger.info("Connected to LanceDB database")
        embedding_record_type = get_embedding_record_type(
            embedding_model_config.embedding_dim
        )
        if table_name not in self.db.table_names():
            self.table = self.db.create_table(
                table_name, schema=embedding_record_type
            )

            logger.info(f"Created new table: {table_name}")
        else:
            # The table already exists
            self.table = self.db.open_table(table_name)
            logger.info(f"Opened existing table: {table_name}")

    def add_embeddings(self, records: list[EmbeddingRecord]) -> None:
        """
        Add multiple embeddings to the table in a batch operation.
        """
        if not records:
            return

        logger.info(f"Adding {len(records)} embeddings")
        self.table.add([record.model_dump() for record in records])
        self.table.create_fts_index(
            "code", tokenizer_name="en_stem", replace=True
        )
        logger.info(
            f"Successfully added {len(records)} embeddings with FTS index"
        )

    def remove_embedding(self, file_path: str) -> None:
        """
        Remove the embedding(s) matching a specific file_path.
        This uses LanceDB's delete with a filter expression.
        """
        logger.info(f"Removing embedding for file: {file_path}")
        filter_expr = f"file_path == '{file_path}'"
        self.table.delete(filter_expr)
        logger.info("Successfully removed embedding")

    def search_similar_embeddings(
        self,
        *,
        query_text: str,
        query_embedding: list[float],
        dim: int,
        top_k: int = 5,
    ) -> list[EmbeddingRecord]:
        """
        Search the table for the nearest neighbors to a query embedding using ANN search.
        Returns the top_k most similar embeddings.

        Args:
            query_embedding: List of floats representing the query vector
            top_k: Number of similar embeddings to return
            nprobes: Number of clusters to search in IVF index (higher = more accurate but slower)

        Returns:
            DataFrame containing the top_k most similar embeddings
        """
        import numpy as np

        logger.info(f"Searching for {top_k} most similar embeddings using ANN")

        results = (
            self.table.search(
                query_type="hybrid",
                vector_column_name="embedding",
            )
            .text(query_text)
            # Convert the query embedding to a numpy array to ensure proper vector format
            .vector(np.array(query_embedding, dtype=np.float32))
            .limit(top_k)
            .to_pydantic(get_embedding_record_type(dim))
        )
        logger.info(f"Found {len(results)} results")
        return results  # type: ignore

    def clear(self) -> None:
        """
        Clears all data by removing the entire database directory.
        """
        logger.info("Clearing Lance embedding store")
        try:
            # Get database path and table name before closing connection
            db_path = self.db.uri
            # Remove the entire database directory if it exists
            if os.path.exists(db_path):
                import shutil

                shutil.rmtree(db_path)
                logger.info(f"Removed database directory: {db_path}")
            else:
                logger.info(f"Database directory does not exist: {db_path}")

        except Exception as e:
            logger.error(f"Error clearing Lance embedding store: {e}")
            raise

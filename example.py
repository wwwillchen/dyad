import logging

from dyad.indexing.semantic_search_store import SemanticSearchStore

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def main():
    # Create example file updates
    # current_time = time.time()
    # updates = [
    #     FileUpdate(type="new", file_path="README.md", timestamp=current_time),
    #     FileUpdate(type="update", file_path="dyad.sh", timestamp=current_time),
    #     FileUpdate(
    #         type="delete", file_path="src/old_file.py", timestamp=current_time
    #     ),
    # ]

    search_store = SemanticSearchStore()
    # search_store.process_updates(updates)
    search_store.search("dialog")


if __name__ == "__main__":
    main()

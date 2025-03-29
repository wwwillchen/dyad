import os

from sqlmodel import SQLModel, create_engine, text

from dyad.workspace_util import get_workspace_storage_dir

storage_dir = get_workspace_storage_dir()
os.makedirs(storage_dir, exist_ok=True)
gitignore_path = os.path.join(storage_dir, ".gitignore")
if not os.path.exists(gitignore_path):
    with open(gitignore_path, "w") as f:
        f.write("# Automatically created by dyad.\n*")

engine = create_engine(f"sqlite:///{os.path.join(storage_dir, 'workspace.db')}")


def drop_all_tables():
    """
    Clears all rows from all tables in the database while keeping the table structures intact.
    This maintains the database schema but removes all data.
    """
    with engine.connect() as conn:
        # Get all table names
        result = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table'")
        )
        tables = result.fetchall()

        # Disable foreign key checks temporarily to avoid constraint issues
        conn.execute(text("PRAGMA foreign_keys=OFF"))

        # Delete all rows from each table
        for table in tables:
            table_name = table[0]
            if table_name != "sqlite_sequence":  # Skip internal SQLite tables
                conn.execute(text(f"DELETE FROM {table_name}"))

        # Re-enable foreign key checks
        conn.execute(text("PRAGMA foreign_keys=ON"))

        # Commit the changes
        conn.commit()

    # Recreate all tables (assuming you're using SQLModel)
    SQLModel.metadata.create_all(engine)


with engine.connect() as conn:
    # see: https://briandouglas.ie/sqlite-defaults/
    conn.execute(
        text("PRAGMA journal_mode=WAL")
    )  # allow concurrent reads & writes
    conn.execute(text("PRAGMA synchronous=NORMAL"))  # editorer writes
    conn.execute(text("PRAGMA cache_size=-64000"))  # 64 MB cache
    conn.execute(text("PRAGMA foreign_keys=ON"))
    conn.execute(text("PRAGMA auto_vacuum = INCREMENTAL"))

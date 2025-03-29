from sqlmodel import SQLModel

from dyad.logging.logging import LogEntry as LogEntry
from dyad.storage import db as db
from dyad.storage.models import chat as chat
from dyad.storage.models import embedding_metadata as embedding_metadata
from dyad.storage.models import pad as pad

SQLModel.metadata.create_all(db.engine)

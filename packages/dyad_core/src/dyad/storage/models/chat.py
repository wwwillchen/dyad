from datetime import datetime

from sqlmodel import Field, Session, SQLModel, select

from dyad.chat import Chat, ChatMetadata
from dyad.logging.logging import logger
from dyad.storage.db import engine


class ChatModel(SQLModel, table=True):
    id: str = Field(primary_key=True)
    title: str
    data_json: str
    created_at: datetime = Field(
        default_factory=lambda: datetime.now().astimezone(), nullable=False
    )
    updated_at: datetime = Field(
        default_factory=lambda: datetime.now().astimezone(), nullable=False
    )


def delete_chat(chat_id: str):
    global _cached_total_chats
    _cached_total_chats = None
    with Session(engine) as session:
        chat = session.get(ChatModel, chat_id)
        if chat:
            session.delete(chat)
            session.commit()
        else:
            logger().warning(f"Chat with id {chat_id} not found.")


def save_chat(chat: Chat):
    global _cached_total_chats
    _cached_total_chats = None
    logger().info(f"Saving chat with id {chat.id}")
    with Session(engine) as session:
        # Check if the chat already exists
        existing_model = session.get(ChatModel, chat.id)

        if existing_model:
            # Update existing model
            existing_model.data_json = chat.model_dump_json()
            existing_model.updated_at = datetime.now().astimezone()
        else:
            # Create new model
            model = ChatModel(
                id=chat.id,
                title=chat.turns[0].current_message.content.get_text()[0:100],
                data_json=chat.model_dump_json(),
            )
            session.add(model)

        session.commit()


def _get_chat(chat_id: str) -> ChatModel:
    with Session(engine) as session:
        statement = select(ChatModel).where(ChatModel.id == chat_id)
        model = session.exec(statement).first()
        if model is None:
            raise ValueError(f"Chat {chat_id} not found")
        return model


def get_chats(page: int = 1, page_size: int = 20) -> list[ChatMetadata]:
    with Session(engine) as session:
        offset = (page - 1) * page_size
        statement = (
            select(ChatModel.id, ChatModel.title, ChatModel.updated_at)
            .order_by(ChatModel.updated_at.desc())  # type: ignore
            .offset(offset)
            .limit(page_size)
        )
        results = session.exec(statement).all()
        chat_metadata_list = [
            ChatMetadata(id=id, title=title, updated_at=updated_at)
            for id, title, updated_at in results
        ]
        return chat_metadata_list


_cached_total_chats = None


def get_total_chats() -> int:
    global _cached_total_chats
    if _cached_total_chats is not None:
        return _cached_total_chats
    with Session(engine) as session:
        statement = select(ChatModel)
        _cached_total_chats = len(session.exec(statement).all())
        return _cached_total_chats


def get_chat(chat_id: str) -> Chat:
    return Chat.model_validate_json(_get_chat(chat_id).data_json)


def update_chat_title(*, chat_id: str, new_title: str) -> None:
    """
    Updates the title of a chat in the database.

    Args:
        chat_id: The ID of the chat to update
        new_title: The new title to set for the chat

    Raises:
        ValueError: If the chat with the given ID is not found
    """
    with Session(engine) as session:
        chat = session.get(ChatModel, chat_id)
        if chat is None:
            raise ValueError(f"Chat {chat_id} not found")

        chat.title = new_title
        chat.updated_at = datetime.now().astimezone()
        session.commit()
        logger().info(f"Updated title for chat {chat_id}")

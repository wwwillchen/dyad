import mesop as me
from dyad.chat import Chat
from pydantic import BaseModel, Field

from dyad_app.ui.state import AcademyData


class MessageNavigationState(BaseModel):
    turn_index_to_message_index: dict[int, int] = Field(default_factory=dict)


@me.stateclass
class ViewerState:
    current_chat: Chat
    academy_data: AcademyData
    scroll_counter: int = 0
    # Store message navigation state separately from the chat data
    message_navigation: MessageNavigationState

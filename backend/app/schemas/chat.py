from pydantic import BaseModel
from datetime import datetime


class ChatMessageCreate(BaseModel):
    message: str


class ChatMessageResponse(BaseModel):
    id: str
    ticket_id: str
    sender_id: str
    sender_name: str
    message: str
    is_system: bool = False
    created_at: datetime

    class Config:
        from_attributes = True

import uuid
from datetime import datetime
from pydantic import BaseModel


class UserBrief(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class CommentCreate(BaseModel):
    message: str
    is_internal: bool = False


class CommentResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    user_id: uuid.UUID
    message: str
    is_internal: bool
    created_at: datetime
    user: UserBrief | None = None

    class Config:
        from_attributes = True


CommentResponse.model_rebuild()


class AttachmentResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    original_filename: str
    file_size: int
    mime_type: str | None = None
    uploaded_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class HistoryResponse(BaseModel):
    id: uuid.UUID
    ticket_id: uuid.UUID
    user_id: uuid.UUID
    action: str
    old_value: str | None = None
    new_value: str | None = None
    description: str | None = None
    created_at: datetime
    user_name: str | None = None

    class Config:
        from_attributes = True


class DashboardStats(BaseModel):
    total_tickets: int
    open_tickets: int
    in_progress_tickets: int
    resolved_tickets: int
    closed_tickets: int
    avg_resolution_hours: float | None = None
    sla_breach_count: int


class StatusCount(BaseModel):
    status: str
    count: int


class PriorityCount(BaseModel):
    priority: str
    count: int


class SectorCount(BaseModel):
    sector: str
    count: int


class TechnicianCount(BaseModel):
    technician_name: str
    technician_id: uuid.UUID
    count: int

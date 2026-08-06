import uuid
from datetime import datetime
from pydantic import BaseModel


class TicketCreate(BaseModel):
    title: str
    description: str
    sector_id: uuid.UUID
    category: str | None = None
    priority: str = "medium"


class TicketUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    category: str | None = None


class TicketStatusUpdate(BaseModel):
    status: str


class TicketPriorityUpdate(BaseModel):
    priority: str


class TicketAssign(BaseModel):
    assigned_to: uuid.UUID


class TicketFilter(BaseModel):
    status: str | None = None
    priority: str | None = None
    sector_id: uuid.UUID | None = None
    category: str | None = None
    assigned_to: uuid.UUID | None = None
    search: str | None = None
    page: int = 1
    per_page: int = 20


class UserBrief(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: str

    class Config:
        from_attributes = True


class SectorBrief(BaseModel):
    id: uuid.UUID
    name: str

    class Config:
        from_attributes = True


class TicketResponse(BaseModel):
    id: uuid.UUID
    ticket_number: int
    title: str
    description: str
    status: str
    priority: str
    sector_id: uuid.UUID
    category: str | None = None
    created_by: uuid.UUID
    assigned_to: uuid.UUID | None = None
    sla_deadline: datetime | None = None
    resolved_at: datetime | None = None
    closed_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    creator: UserBrief | None = None
    assignee: UserBrief | None = None
    sector: SectorBrief | None = None

    class Config:
        from_attributes = True


class TicketListResponse(BaseModel):
    tickets: list[TicketResponse]
    total: int
    page: int
    per_page: int
    pages: int


class SectorResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None = None
    is_active: bool = True

    class Config:
        from_attributes = True


class AttachmentResponse(BaseModel):
    id: str
    ticket_id: str
    original_filename: str
    file_size: int
    mime_type: str | None = None
    uploader_name: str
    created_at: datetime

    class Config:
        from_attributes = True

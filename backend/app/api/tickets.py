import os
import secrets
import uuid
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, Form, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.config import get_settings
from app.models.user import User
from app.models.comment import TicketAttachment
from app.schemas.ticket import (
    TicketCreate, TicketResponse, TicketListResponse, TicketUpdate,
    TicketStatusUpdate, TicketPriorityUpdate, TicketAssign,
)
from app.dependencies import get_current_user, require_technician_or_admin, ensure_ticket_access
from app.services import ticket_service
from app.services.chat_service import send_chat_message, get_chat_notifications
from app.services.email_service import notify_ticket_event, notify_assignment, notify_status_change, notify_ticket_updated, notify_priority_changed
from app.api.attachments import validate_file

router = APIRouter()
settings = get_settings()


@router.get("/notifications")
async def chat_notifications(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    return await get_chat_notifications(db, user)


async def _get_ticket_or_404(db: AsyncSession, ticket_id: uuid.UUID) -> object:
    ticket = await ticket_service.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")
    return ticket


def _user_can_edit(ticket, user: User) -> bool:
    return ticket.created_by == user.id or user.role in ("admin", "technician")


@router.post("", response_model=TicketResponse)
async def create_ticket(
    title: str = Form(...),
    description: str = Form(...),
    sector_id: uuid.UUID = Form(...),
    category: str | None = Form(None),
    priority: str = Form("medium"),
    files: list[UploadFile] = File(default=[]),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    validated = TicketCreate(
        title=title,
        description=description,
        sector_id=sector_id,
        category=category,
        priority=priority,
    )
    ticket = await ticket_service.create_ticket(
        db, user.id, validated.title, validated.description,
        validated.sector_id, validated.category, validated.priority,
    )
    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])

    now = datetime.now(timezone.utc)
    hora = now.strftime("%d/%m/%Y às %H:%M")
    system_msg = (
        f"Chamado #{ticket.ticket_number} aberto em {hora} por {user.name}.\n"
        f"Titulo: {ticket.title}\n"
        f"Setor: {ticket.sector.name if ticket.sector else 'N/A'}\n"
        f"Categoria: {ticket.category or 'N/A'}\n"
        f"Prioridade: {ticket.priority}"
    )
    await send_chat_message(db, ticket.id, user.id, system_msg, is_system=True)

    for file in files:
        if not file or not file.filename:
            continue
        content = await file.read()
        ext = validate_file(file, len(content))

        os.makedirs(settings.UPLOAD_DIR, exist_ok=True)
        stored_name = f"{secrets.token_hex(16)}{ext}"
        file_path = os.path.join(settings.UPLOAD_DIR, stored_name)
        with open(file_path, "wb") as f:
            f.write(content)

        attachment = TicketAttachment(
            ticket_id=ticket.id,
            original_filename=file.filename or "arquivo",
            stored_filename=stored_name,
            file_size=len(content),
            mime_type=file.content_type,
            uploaded_by=user.id,
        )
        db.add(attachment)

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])

    await notify_ticket_event(ticket, user, "created", db)
    return ticket


@router.get("", response_model=TicketListResponse)
async def list_tickets(
    status: str | None = Query(None),
    priority: str | None = Query(None),
    sector_id: uuid.UUID | None = Query(None),
    category: str | None = Query(None),
    assigned_to: uuid.UUID | None = Query(None),
    search: str | None = Query(None),
    page: int = Query(1, ge=1),
    per_page: int = Query(20, ge=1, le=100),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await ticket_service.list_tickets(
        db, user, status, priority, sector_id, category, assigned_to, search, page, per_page
    )
    return TicketListResponse(
        tickets=[TicketResponse.model_validate(t) for t in result["tickets"]],
        total=result["total"],
        page=result["page"],
        per_page=result["per_page"],
        pages=result["pages"],
    )


@router.get("/{ticket_id}", response_model=TicketResponse)
async def get_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await _get_ticket_or_404(db, ticket_id)
    ensure_ticket_access(user, ticket)
    return ticket


@router.put("/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: uuid.UUID,
    data: TicketUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await _get_ticket_or_404(db, ticket_id)
    if not _user_can_edit(ticket, user):
        raise HTTPException(status_code=403, detail="Sem permissao")

    update_data = data.model_dump(exclude_unset=True)
    field_labels = {"title": "Titulo", "description": "Descricao", "category": "Categoria"}
    changes = []
    for field, value in update_data.items():
        old = getattr(ticket, field)
        if old != value:
            changes.append((field_labels.get(field, field), old, value))
            setattr(ticket, field, value)

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    await notify_ticket_updated(ticket, user, changes)
    return ticket


@router.put("/{ticket_id}/status", response_model=TicketResponse)
async def update_status(
    ticket_id: uuid.UUID,
    data: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await _get_ticket_or_404(db, ticket_id)
    if not ticket_service.can_transition(user, ticket, data.status):
        raise HTTPException(status_code=400, detail=f"Transicao invalida: {ticket.status} -> {data.status}")

    old_status = ticket.status
    try:
        ticket = await ticket_service.update_ticket_status(db, ticket, user, data.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    await notify_status_change(ticket, user, old_status, data.status)
    return ticket


@router.put("/{ticket_id}/priority", response_model=TicketResponse)
async def update_priority(
    ticket_id: uuid.UUID,
    data: TicketPriorityUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_technician_or_admin),
):
    ticket = await _get_ticket_or_404(db, ticket_id)
    old_priority = ticket.priority
    await ticket_service.update_ticket_priority(db, ticket, user.id, data.priority)
    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    await notify_priority_changed(ticket, user, old_priority, data.priority)
    return ticket


@router.put("/{ticket_id}/assign", response_model=TicketResponse)
async def assign_ticket(
    ticket_id: uuid.UUID,
    data: TicketAssign,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_technician_or_admin),
):
    ticket = await _get_ticket_or_404(db, ticket_id)
    await ticket_service.assign_ticket(db, ticket, data.assigned_to, user.id)
    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    await notify_assignment(ticket, user)
    return ticket
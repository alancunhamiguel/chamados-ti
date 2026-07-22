import uuid
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.ticket import (
    TicketCreate, TicketResponse, TicketListResponse, TicketUpdate,
    TicketStatusUpdate, TicketPriorityUpdate, TicketAssign,
)
from app.dependencies import get_current_user, require_admin, require_technician_or_admin
from app.services import ticket_service

router = APIRouter()


@router.post("", response_model=TicketResponse)
async def create_ticket(
    data: TicketCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await ticket_service.create_ticket(
        db, user.id, data.title, data.description, data.sector_id, data.category, data.priority
    )
    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
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
    ticket = await ticket_service.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")
    return ticket


@router.put("/{ticket_id}", response_model=TicketResponse)
async def update_ticket(
    ticket_id: uuid.UUID,
    data: TicketUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await ticket_service.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    if ticket.created_by != user.id and user.role not in ["admin", "technician"]:
        raise HTTPException(status_code=403, detail="Sem permissao")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(ticket, field, value)

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    return ticket


@router.put("/{ticket_id}/status", response_model=TicketResponse)
async def update_status(
    ticket_id: uuid.UUID,
    data: TicketStatusUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_technician_or_admin),
):
    try:
        ticket = await ticket_service.update_ticket_status(db, ticket_id, user.id, data.status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    return ticket


@router.put("/{ticket_id}/priority", response_model=TicketResponse)
async def update_priority(
    ticket_id: uuid.UUID,
    data: TicketPriorityUpdate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_technician_or_admin),
):
    ticket = await ticket_service.update_ticket_priority(db, ticket_id, user.id, data.priority)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    return ticket


@router.put("/{ticket_id}/assign", response_model=TicketResponse)
async def assign_ticket(
    ticket_id: uuid.UUID,
    data: TicketAssign,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(require_admin),
):
    ticket = await ticket_service.assign_ticket(db, ticket_id, data.assigned_to, user.id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    return ticket


@router.put("/{ticket_id}/close", response_model=TicketResponse)
async def close_ticket(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = await ticket_service.get_ticket(db, ticket_id)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    if ticket.created_by != user.id and user.role not in ["admin", "technician"]:
        raise HTTPException(status_code=403, detail="Sem permissao")

    ticket = await ticket_service.close_ticket(db, ticket_id, user.id)
    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])
    return ticket

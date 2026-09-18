import uuid
from datetime import datetime, timedelta, timezone
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.ticket import Ticket, Sector
from app.models.user import User
from app.models.comment import TicketHistory
from app.services.chat_service import delete_chat_messages

SLA_HOURS = {
    "critical": 4,
    "high": 8,
    "medium": 24,
    "low": 72,
}

# Transitions allowed for staff (technician/admin) via the status endpoint.
# "resolved -> in_progress" means REOPENING a resolved ticket; "resolved -> closed"
# is the staff override to close once the work is done.
STAFF_TRANSITIONS = {
    "open": ["in_progress"],
    "in_progress": ["waiting", "resolved"],
    "waiting": ["in_progress"],
    "resolved": ["in_progress", "closed"],
    "closed": [],
}

# Transitions allowed for the ticket creator (employee) in the
# confirmation/closing flow: they confirm the solution (-> closed) or
# return/devolution the solution (-> in_progress) when it did not solve
# the problem.
CREATOR_TRANSITIONS = {
    "resolved": ["closed", "in_progress"],
    "closed": [],
}

STATUS_LABELS = {
    "open": "Aberto",
    "in_progress": "Em andamento",
    "waiting": "Aguardando",
    "resolved": "Resolvido",
    "closed": "Encerrado",
}


def calculate_sla_deadline(priority: str, created_at: datetime) -> datetime:
    hours = SLA_HOURS.get(priority, 24)
    return created_at + timedelta(hours=hours)


async def log_action(db: AsyncSession, ticket_id: uuid.UUID, user_id: uuid.UUID, action: str, old_value: str | None = None, new_value: str | None = None, description: str | None = None):
    history = TicketHistory(
        ticket_id=ticket_id,
        user_id=user_id,
        action=action,
        old_value=old_value,
        new_value=new_value,
        description=description,
    )
    db.add(history)


def can_transition(user: User, ticket: Ticket, new_status: str) -> bool:
    """Central permission matrix for status transitions.

    - Staff (technician/admin) follow STAFF_TRANSITIONS.
    - The ticket creator follows CREATOR_TRANSITIONS (confirmation flow).
    - A user is allowed if any applicable rule permits the transition.
    """
    current = ticket.status
    is_staff = user.role in ("technician", "admin")
    is_creator = ticket.created_by == user.id

    if is_creator and new_status in CREATOR_TRANSITIONS.get(current, []):
        return True
    if is_staff and new_status in STAFF_TRANSITIONS.get(current, []):
        return True
    return False


async def create_ticket(db: AsyncSession, user_id: uuid.UUID, title: str, description: str, sector_id: uuid.UUID, category: str | None = None, priority: str = "medium") -> Ticket:
    now = datetime.now(timezone.utc)

    max_num_result = await db.execute(select(func.max(Ticket.ticket_number)))
    max_num = max_num_result.scalar() or 0

    ticket = Ticket(
        ticket_number=max_num + 1,
        title=title,
        description=description,
        status="open",
        priority=priority,
        sector_id=sector_id,
        category=category,
        created_by=user_id,
        created_at=now,
        updated_at=now,
        sla_deadline=calculate_sla_deadline(priority, now),
    )
    db.add(ticket)
    await db.flush()
    await log_action(db, ticket.id, user_id, "created", new_value="open", description="Chamado criado")
    return ticket


async def get_ticket(db: AsyncSession, ticket_id: uuid.UUID) -> Ticket | None:
    result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.creator), selectinload(Ticket.assignee), selectinload(Ticket.sector))
        .where(Ticket.id == ticket_id)
    )
    return result.scalar_one_or_none()


async def list_tickets(db: AsyncSession, user: User, status: str | None = None, priority: str | None = None, sector_id: uuid.UUID | None = None, category: str | None = None, assigned_to: uuid.UUID | None = None, search: str | None = None, page: int = 1, per_page: int = 20):
    query = select(Ticket).options(selectinload(Ticket.creator), selectinload(Ticket.assignee), selectinload(Ticket.sector))

    if user.role == "employee":
        query = query.where(Ticket.created_by == user.id)

    if status:
        query = query.where(Ticket.status == status)
    if priority:
        query = query.where(Ticket.priority == priority)
    if sector_id:
        query = query.where(Ticket.sector_id == sector_id)
    if category:
        query = query.where(Ticket.category == category)
    if assigned_to:
        query = query.where(Ticket.assigned_to == assigned_to)
    if search:
        search_filter = or_(Ticket.title.ilike(f"%{search}%"), Ticket.description.ilike(f"%{search}%"))
        query = query.where(search_filter)

    count_query = select(func.count()).select_from(query.subquery())
    total = (await db.execute(count_query)).scalar() or 0

    query = query.order_by(Ticket.created_at.desc())
    query = query.offset((page - 1) * per_page).limit(per_page)

    result = await db.execute(query)
    tickets = list(result.scalars().all())

    return {
        "tickets": tickets,
        "total": total,
        "page": page,
        "per_page": per_page,
        "pages": (total + per_page - 1) // per_page,
    }


async def update_ticket_status(db: AsyncSession, ticket: Ticket, user: User, new_status: str) -> Ticket | None:
    """Change ticket status honoring the role-aware state machine."""
    if not can_transition(user, ticket, new_status):
        raise ValueError(f"Transicao invalida: {ticket.status} -> {new_status}")

    old_status = ticket.status
    ticket.status = new_status
    ticket.updated_at = datetime.now(timezone.utc)

    now = datetime.now(timezone.utc)
    if new_status == "resolved":
        ticket.resolved_at = now
    elif new_status == "closed":
        ticket.closed_at = now
        ticket.resolved_at = ticket.resolved_at or now
    elif new_status == "in_progress" and old_status == "resolved":
        ticket.resolved_at = None

    await log_action(
        db, ticket.id, user.id, "status_changed",
        old_value=old_status, new_value=new_status,
        description=f"Status alterado de {STATUS_LABELS.get(old_status, old_status)} para {STATUS_LABELS.get(new_status, new_status)}",
    )
    return ticket


async def update_ticket_priority(db: AsyncSession, ticket: Ticket, user_id: uuid.UUID, new_priority: str) -> Ticket | None:
    old_priority = ticket.priority
    ticket.priority = new_priority
    ticket.sla_deadline = calculate_sla_deadline(new_priority, ticket.created_at)
    ticket.updated_at = datetime.now(timezone.utc)

    await log_action(db, ticket.id, user_id, "priority_changed", old_value=old_priority, new_value=new_priority)
    return ticket


async def assign_ticket(db: AsyncSession, ticket: Ticket, technician_id: uuid.UUID, assigner_id: uuid.UUID) -> Ticket | None:
    ticket.assigned_to = technician_id
    if ticket.status == "open":
        ticket.status = "in_progress"
        await log_action(
            db, ticket.id, assigner_id, "status_changed",
            old_value="open", new_value="in_progress",
            description="Status alterado de Aberto para Em andamento",
        )
    ticket.updated_at = datetime.now(timezone.utc)

    await log_action(db, ticket.id, assigner_id, "assigned", old_value=None, new_value=str(technician_id))
    return ticket
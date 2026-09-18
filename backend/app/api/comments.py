import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.user import User
from app.models.comment import TicketComment, TicketHistory
from app.models.ticket import Ticket
from app.schemas.comment import CommentCreate, CommentResponse
from app.dependencies import get_current_user, ensure_ticket_access
from app.services.email_service import notify_comment

router = APIRouter()


@router.get("/{ticket_id}/comments", response_model=list[CommentResponse])
async def list_comments(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
    ticket_obj = result.scalar_one_or_none()
    if not ticket_obj:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")
    ensure_ticket_access(user, ticket_obj)

    query = select(TicketComment).options(selectinload(TicketComment.user)).where(
        TicketComment.ticket_id == ticket_id
    )

    if user.role == "employee":
        query = query.where(TicketComment.is_internal == False)

    query = query.order_by(TicketComment.created_at.asc())
    result = await db.execute(query)
    comments = list(result.scalars().all())

    response = []
    for c in comments:
        resp = CommentResponse.model_validate(c)
        resp.user = {"id": c.user.id, "name": c.user.name, "email": c.user.email, "role": c.user.role} if c.user else None
        response.append(resp)

    return response


@router.post("/{ticket_id}/comments", response_model=CommentResponse)
async def add_comment(
    ticket_id: uuid.UUID,
    data: CommentCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if data.is_internal and user.role not in ["technician", "admin"]:
        raise HTTPException(status_code=403, detail="So tecnicos e admins podem criar comentarios internos")

    result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.creator), selectinload(Ticket.assignee))
        .where(Ticket.id == ticket_id)
    )
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    comment = TicketComment(
        ticket_id=ticket_id,
        user_id=user.id,
        message=data.message,
        is_internal=data.is_internal,
    )
    db.add(comment)

    history = TicketHistory(
        ticket_id=ticket_id,
        user_id=user.id,
        action="commented",
        description="Comentario adicionado",
    )
    db.add(history)

    await db.flush()
    await db.refresh(comment, ["user"])

    await notify_comment(ticket, user, data.message, data.is_internal)

    resp = CommentResponse.model_validate(comment)
    resp.user = {"id": user.id, "name": user.name, "email": user.email, "role": user.role}
    return resp

import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.chat import ChatMessageCreate, ChatMessageResponse
from app.services.chat_service import get_chat_messages, send_chat_message
from app.services.ticket_service import get_ticket

router = APIRouter()


@router.get("/{ticket_id}/chat", response_model=list[ChatMessageResponse])
async def list_chat_messages(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    ticket = await get_ticket(db, tid)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    if user.role == "employee" and ticket.created_by != user.id:
        raise HTTPException(status_code=403, detail="Sem permissao")

    messages = await get_chat_messages(db, tid)
    return [
        ChatMessageResponse(
            id=str(m.id),
            ticket_id=str(m.ticket_id),
            sender_id=str(m.sender_id),
            sender_name=m.sender.name if m.sender else "Desconhecido",
            message=m.message,
            is_system=m.is_system,
            created_at=m.created_at,
        )
        for m in messages
    ]


@router.post("/{ticket_id}/chat", response_model=ChatMessageResponse, status_code=201)
async def post_chat_message(
    ticket_id: str,
    data: ChatMessageCreate,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    ticket = await get_ticket(db, tid)
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Chamado fechado")

    if user.role == "employee" and ticket.created_by != user.id:
        raise HTTPException(status_code=403, detail="Sem permissao")

    msg = await send_chat_message(db, tid, user.id, data.message)
    return ChatMessageResponse(
        id=str(msg.id),
        ticket_id=str(msg.ticket_id),
        sender_id=str(msg.sender_id),
        sender_name=msg.sender.name if msg.sender else "Desconhecido",
        message=msg.message,
        created_at=msg.created_at,
    )

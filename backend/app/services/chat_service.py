import uuid
from datetime import datetime, timezone
from sqlalchemy import select, delete, func as sqlfunc
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.models.chat import TicketChat
from app.models.ticket import Ticket


async def get_chat_messages(db: AsyncSession, ticket_id: uuid.UUID) -> list[TicketChat]:
    result = await db.execute(
        select(TicketChat)
        .options(selectinload(TicketChat.sender))
        .where(TicketChat.ticket_id == ticket_id)
        .order_by(TicketChat.created_at.asc())
    )
    return list(result.scalars().all())


async def send_chat_message(db: AsyncSession, ticket_id: uuid.UUID, sender_id: uuid.UUID, message: str, is_system: bool = False) -> TicketChat:
    now = datetime.now(timezone.utc)
    chat_msg = TicketChat(
        ticket_id=ticket_id,
        sender_id=sender_id,
        message=message,
        is_system=is_system,
        created_at=now,
    )
    db.add(chat_msg)
    await db.flush()

    result = await db.execute(
        select(TicketChat)
        .options(selectinload(TicketChat.sender))
        .where(TicketChat.id == chat_msg.id)
    )
    return result.scalar_one()


async def delete_chat_messages(db: AsyncSession, ticket_id: uuid.UUID):
    await db.execute(delete(TicketChat).where(TicketChat.ticket_id == ticket_id))


async def get_chat_notifications(db: AsyncSession, user: "User") -> list[dict]:
    from app.models.user import User

    # Ultima mensagem de cada chamado. Usa ROW_NUMBER() em vez de max(id) porque
    # o Postgres nao define max() para UUID (funcionava no SQLite, quebrava no PG).
    subq = (
        select(
            TicketChat.id.label("id"),
            sqlfunc.row_number()
            .over(
                partition_by=TicketChat.ticket_id,
                order_by=(TicketChat.created_at.desc(), TicketChat.id.desc()),
            )
            .label("rn"),
        )
        .subquery()
    )

    stmt = (
        select(TicketChat)
        .options(selectinload(TicketChat.sender), selectinload(TicketChat.ticket))
        .join(subq, TicketChat.id == subq.c.id)
        .join(Ticket, Ticket.id == TicketChat.ticket_id)
        .where(subq.c.rn == 1)
        .where(Ticket.status != "closed")
        .where(TicketChat.sender_id != user.id)
    )

    if user.role not in ["admin", "technician"]:
        stmt = stmt.where(
            (Ticket.created_by == user.id) | (Ticket.assigned_to == user.id)
        )

    result = await db.execute(stmt)

    messages = result.scalars().all()

    return [
        {
            "ticket_id": str(m.ticket_id),
            "ticket_number": m.ticket.ticket_number if m.ticket else None,
            "message_id": str(m.id),
            "sender_id": str(m.sender_id),
            "sender_name": m.sender.name if m.sender else "Desconhecido",
            "message": m.message,
            "created_at": m.created_at.isoformat() if m.created_at else None,
        }
        for m in messages
    ]

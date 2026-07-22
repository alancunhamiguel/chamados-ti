import uuid
from fastapi import APIRouter, Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.user import User
from app.models.comment import TicketHistory
from app.schemas.comment import HistoryResponse
from app.dependencies import get_current_user

router = APIRouter()


@router.get("/{ticket_id}/history", response_model=list[HistoryResponse])
async def get_history(
    ticket_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    result = await db.execute(
        select(TicketHistory)
        .options(selectinload(TicketHistory.user))
        .where(TicketHistory.ticket_id == ticket_id)
        .order_by(TicketHistory.created_at.asc())
    )
    history = list(result.scalars().all())

    response = []
    for h in history:
        resp = HistoryResponse(
            id=h.id,
            ticket_id=h.ticket_id,
            user_id=h.user_id,
            action=h.action,
            old_value=h.old_value,
            new_value=h.new_value,
            description=h.description,
            created_at=h.created_at,
            user_name=h.user.name if h.user else None,
        )
        response.append(resp)

    return response

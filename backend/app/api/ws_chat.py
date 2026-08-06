import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import async_session
from app.services.auth_service import decode_access_token
from app.services.chat_service import send_chat_message, get_chat_messages
from app.services.ticket_service import get_ticket
from app.models.user import User
from sqlalchemy import select

router = APIRouter()

active_connections: dict[str, list[WebSocket]] = {}


async def get_user_from_token(token: str) -> User | None:
    payload = decode_access_token(token)
    if not payload:
        return None
    user_id = payload.get("sub")
    if not user_id:
        return None
    try:
        uid = uuid.UUID(user_id)
    except (ValueError, AttributeError):
        return None
    async with async_session() as db:
        result = await db.execute(select(User).where(User.id == uid))
        user = result.scalar_one_or_none()
        if user and user.is_active:
            return user
    return None


@router.websocket("/ws/chat/{ticket_id}")
async def websocket_chat(websocket: WebSocket, ticket_id: str):
    token = websocket.query_params.get("token")
    if not token:
        await websocket.close(code=4001, reason="Token missing")
        return

    user = await get_user_from_token(token)
    if not user:
        await websocket.close(code=4001, reason="Invalid token")
        return

    try:
        tid = uuid.UUID(ticket_id)
    except ValueError:
        await websocket.close(code=4002, reason="Invalid ticket ID")
        return

    async with async_session() as db:
        ticket = await get_ticket(db, tid)
        if not ticket:
            await websocket.close(code=4004, reason="Ticket not found")
            return

        if user.role == "employee" and ticket.created_by != user.id:
            await websocket.close(code=4003, reason="Access denied")
            return

    await websocket.accept()

    if ticket_id not in active_connections:
        active_connections[ticket_id] = []
    active_connections[ticket_id].append(websocket)

    try:
        while True:
            data = await websocket.receive_text()
            payload = json.loads(data)

            if payload.get("type") == "message":
                msg_text = payload.get("message", "").strip()
                if not msg_text:
                    continue

                async with async_session() as db:
                    msg = await send_chat_message(db, tid, user.id, msg_text)
                    await db.commit()

                broadcast = json.dumps({
                    "type": "message",
                    "id": str(msg.id),
                    "sender_id": str(user.id),
                    "sender_name": user.name,
                    "message": msg_text,
                    "created_at": msg.created_at.isoformat(),
                })

                for conn in active_connections.get(ticket_id, []):
                    try:
                        await conn.send_text(broadcast)
                    except Exception:
                        pass

    except WebSocketDisconnect:
        pass
    finally:
        if ticket_id in active_connections:
            active_connections[ticket_id] = [
                c for c in active_connections[ticket_id] if c != websocket
            ]
            if not active_connections[ticket_id]:
                del active_connections[ticket_id]

import uuid
import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.config import get_settings
from app.dependencies import get_current_user
from app.models.user import User
from app.models.ticket import Ticket
from app.models.comment import TicketAttachment
from app.schemas.ticket import AttachmentResponse

router = APIRouter()
settings = get_settings()


@router.get("/{ticket_id}/attachments", response_model=list[AttachmentResponse])
async def list_attachments(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    result = await db.execute(
        select(TicketAttachment)
        .options(selectinload(TicketAttachment.uploader))
        .where(TicketAttachment.ticket_id == tid)
        .order_by(TicketAttachment.created_at.desc())
    )
    attachments = result.scalars().all()

    return [
        AttachmentResponse(
            id=str(a.id),
            ticket_id=str(a.ticket_id),
            original_filename=a.original_filename,
            file_size=a.file_size,
            mime_type=a.mime_type,
            uploader_name=a.uploader.name if a.uploader else "Desconhecido",
            created_at=a.created_at,
        )
        for a in attachments
    ]


@router.post("/{ticket_id}/attachments", response_model=AttachmentResponse, status_code=201)
async def upload_attachment(
    ticket_id: str,
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        tid = uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    result = await db.execute(select(Ticket).where(Ticket.id == tid))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Chamado fechado")

    if user.role == "employee" and ticket.created_by != user.id:
        raise HTTPException(status_code=403, detail="Sem permissao")

    content = await file.read()
    if len(content) > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo muito grande (max 10MB)")

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

    ext = os.path.splitext(file.filename or "")[1]
    stored_name = f"{secrets.token_hex(16)}{ext}"
    file_path = os.path.join(settings.UPLOAD_DIR, stored_name)

    with open(file_path, "wb") as f:
        f.write(content)

    attachment = TicketAttachment(
        ticket_id=tid,
        original_filename=file.filename or "arquivo",
        stored_filename=stored_name,
        file_size=len(content),
        mime_type=file.content_type,
        uploaded_by=user.id,
    )
    db.add(attachment)
    await db.flush()

    return AttachmentResponse(
        id=str(attachment.id),
        ticket_id=str(attachment.ticket_id),
        original_filename=attachment.original_filename,
        file_size=attachment.file_size,
        mime_type=attachment.mime_type,
        uploader_name=user.name,
        created_at=attachment.created_at,
    )


@router.delete("/{ticket_id}/attachments/{attachment_id}")
async def delete_attachment(
    ticket_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    try:
        aid = uuid.UUID(attachment_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    result = await db.execute(select(TicketAttachment).where(TicketAttachment.id == aid))
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Anexo nao encontrado")

    if user.role == "employee" and attachment.uploaded_by != user.id:
        raise HTTPException(status_code=403, detail="Sem permissao")

    file_path = os.path.join(settings.UPLOAD_DIR, attachment.stored_filename)
    if os.path.exists(file_path):
        os.remove(file_path)

    await db.delete(attachment)
    return {"message": "Anexo removido"}

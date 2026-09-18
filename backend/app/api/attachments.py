import uuid
import os
import secrets
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
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

# Whitelist of accepted file types (extensions + the common MIME types they map to).
ALLOWED_EXTENSIONS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".bmp", ".tiff",
    ".pdf", ".doc", ".docx", ".xls", ".xlsx", ".ppt", ".pptx",
    ".txt", ".csv", ".log",
    ".zip", ".rar", ".7z", ".tar", ".gz",
    ".mp3", ".mp4", ".mov", ".wav",
}

ALLOWED_MIME_PREFIXES = {
    "image/", "text/", "application/pdf", "application/msword",
    "application/vnd.openxmlformats-officedocument", "application/zip",
    "application/x-rar", "application/x-7z-compressed",
    "audio/", "video/",
}


def parse_ticket_id(ticket_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(ticket_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")


def validate_file(file: UploadFile, content_length: int) -> str:
    """Validate extension, size and MIME. Returns the original extension or raises 400."""
    filename = file.filename or "arquivo"
    ext = os.path.splitext(filename)[1].lower()

    if content_length > settings.MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="Arquivo muito grande (max 50MB)")

    if content_length <= 0:
        raise HTTPException(status_code=400, detail="Arquivo vazio")

    if ext not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Tipo de arquivo nao permitido")

    mime = (file.content_type or "").lower()
    if mime:
        if not any(mime.startswith(p) for p in ALLOWED_MIME_PREFIXES):
            raise HTTPException(status_code=400, detail="Tipo de arquivo nao permitido")

    return ext


def can_view_attachment(user: User, ticket: Ticket) -> bool:
    return user.role in ("technician", "admin") or ticket.created_by == user.id


@router.get("/{ticket_id}/attachments", response_model=list[AttachmentResponse])
async def list_attachments(
    ticket_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    tid = parse_ticket_id(ticket_id)
    ticket = (await db.execute(select(Ticket).where(Ticket.id == tid))).scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")
    if not can_view_attachment(user, ticket):
        raise HTTPException(status_code=403, detail="Sem permissao")

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
    tid = parse_ticket_id(ticket_id)

    result = await db.execute(select(Ticket).where(Ticket.id == tid))
    ticket = result.scalar_one_or_none()
    if not ticket:
        raise HTTPException(status_code=404, detail="Chamado nao encontrado")

    if ticket.status == "closed":
        raise HTTPException(status_code=400, detail="Chamado fechado")

    if user.role == "employee" and ticket.created_by != user.id:
        raise HTTPException(status_code=403, detail="Sem permissao")

    content = await file.read()
    ext = validate_file(file, len(content))

    os.makedirs(settings.UPLOAD_DIR, exist_ok=True)

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


@router.get("/{ticket_id}/attachments/{attachment_id}/download")
async def download_attachment(
    ticket_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    aid = parse_ticket_id(attachment_id)

    result = await db.execute(
        select(TicketAttachment).where(TicketAttachment.id == aid)
    )
    attachment = result.scalar_one_or_none()
    if not attachment:
        raise HTTPException(status_code=404, detail="Anexo nao encontrado")

    ticket = (await db.execute(select(Ticket).where(Ticket.id == attachment.ticket_id))).scalar_one_or_none()
    if not ticket or not can_view_attachment(user, ticket):
        raise HTTPException(status_code=403, detail="Sem permissao")

    file_path = os.path.join(settings.UPLOAD_DIR, attachment.stored_filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="Arquivo nao encontrado no disco")

    return FileResponse(
        path=file_path,
        filename=attachment.original_filename,
        media_type=attachment.mime_type or "application/octet-stream",
        headers={"Cache-Control": "private, no-store"},
    )


@router.delete("/{ticket_id}/attachments/{attachment_id}")
async def delete_attachment(
    ticket_id: str,
    attachment_id: str,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    aid = parse_ticket_id(attachment_id)

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
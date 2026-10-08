"""Rotas do SuporteBot: chat com a Claude, historico por usuario e base de conhecimento."""

import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.dependencies import get_current_user, require_technician_or_admin
from app.models.bot_conversation import BotConversation, BotKnowledge
from app.models.user import User
from app.services import bot_service
from app.services.bot_service import BotNotConfigured, BotUnavailable

router = APIRouter()
settings = get_settings()

NOT_CONFIGURED_MSG = (
    "SuporteBot desativado: defina ANTHROPIC_API_KEY (API da Anthropic) ou CLAUDE_URL "
    "(conteiner chamados-claude com a assinatura) no backend/.env e reinicie o servidor."
)


# ----------------------------- schemas ------------------------------------- #

class BotMessageRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=5000)


class BotMessageResponse(BaseModel):
    id: str
    role: str
    content: str
    created_at: datetime | None = None


class BotStatusResponse(BaseModel):
    configured: bool
    provider: str | None = None   # "api" | "claude_cli" | None
    model: str
    detail: str = ""
    knowledge_articles: int


class KnowledgeCreate(BaseModel):
    title: str = Field(..., min_length=3, max_length=200)
    content: str = Field(..., min_length=3, max_length=20000)
    category: str | None = Field(None, max_length=50)


class KnowledgeUpdate(BaseModel):
    title: str | None = Field(None, min_length=3, max_length=200)
    content: str | None = Field(None, min_length=3, max_length=20000)
    category: str | None = Field(None, max_length=50)
    is_active: bool | None = None


class KnowledgeResponse(BaseModel):
    id: str
    title: str
    content: str
    category: str | None
    is_active: bool
    author_name: str | None
    created_at: datetime | None
    updated_at: datetime | None


def _msg_out(m: BotConversation) -> BotMessageResponse:
    return BotMessageResponse(id=str(m.id), role=m.role, content=m.content, created_at=m.created_at)


def _knowledge_out(a: BotKnowledge) -> KnowledgeResponse:
    return KnowledgeResponse(
        id=str(a.id),
        title=a.title,
        content=a.content,
        category=a.category,
        is_active=a.is_active,
        author_name=a.author.name if a.author else None,
        created_at=a.created_at,
        updated_at=a.updated_at,
    )


def _parse_uuid(value: str) -> uuid.UUID:
    try:
        return uuid.UUID(value)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")


# ----------------------------- chat ---------------------------------------- #

@router.get("/status", response_model=BotStatusResponse, summary="Situacao do SuporteBot")
async def bot_status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    return BotStatusResponse(**await bot_service.get_status(db))


@router.post("/chat", response_model=BotMessageResponse, summary="Enviar mensagem para o SuporteBot")
async def send_bot_message(
    body: BotMessageRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    message = body.message.strip()
    if not message:
        raise HTTPException(status_code=400, detail="Mensagem nao pode ser vazia")

    try:
        reply = await bot_service.ask_claude(db, user, message)
    except BotNotConfigured:
        raise HTTPException(status_code=503, detail=NOT_CONFIGURED_MSG)
    except BotUnavailable as exc:
        raise HTTPException(status_code=502, detail=str(exc))

    return _msg_out(reply)


@router.get("/history", response_model=list[BotMessageResponse], summary="Historico do usuario com o SuporteBot")
async def get_bot_history(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    history = await bot_service.get_conversation_history(db, user.id)
    return [_msg_out(m) for m in history]


@router.delete("/history", summary="Limpar historico do usuario com o SuporteBot")
async def clear_bot_history(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    deleted = await bot_service.clear_conversation(db, user.id)
    return {"message": f"{deleted} mensagens removidas", "deleted_count": deleted}


# ----------------------------- base de conhecimento ------------------------- #

@router.get("/knowledge", response_model=list[KnowledgeResponse], summary="Listar artigos da base de conhecimento")
async def list_knowledge(db: AsyncSession = Depends(get_db), staff: User = Depends(require_technician_or_admin)):
    return [_knowledge_out(a) for a in await bot_service.list_knowledge(db)]


@router.post("/knowledge", response_model=KnowledgeResponse, status_code=201, summary="Ensinar o SuporteBot (novo artigo)")
async def create_knowledge(
    data: KnowledgeCreate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_technician_or_admin),
):
    art = await bot_service.create_knowledge(db, staff.id, data.title, data.content, data.category)
    return _knowledge_out(art)


@router.put("/knowledge/{knowledge_id}", response_model=KnowledgeResponse, summary="Editar artigo")
async def update_knowledge(
    knowledge_id: str,
    data: KnowledgeUpdate,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_technician_or_admin),
):
    art = await bot_service.get_knowledge(db, _parse_uuid(knowledge_id))
    if not art:
        raise HTTPException(status_code=404, detail="Artigo nao encontrado")
    art = await bot_service.update_knowledge(
        db, art, title=data.title, content=data.content, category=data.category, is_active=data.is_active,
    )
    return _knowledge_out(art)


@router.delete("/knowledge/{knowledge_id}", summary="Excluir artigo")
async def delete_knowledge(
    knowledge_id: str,
    db: AsyncSession = Depends(get_db),
    staff: User = Depends(require_technician_or_admin),
):
    art = await bot_service.get_knowledge(db, _parse_uuid(knowledge_id))
    if not art:
        raise HTTPException(status_code=404, detail="Artigo nao encontrado")
    await bot_service.delete_knowledge(db, art)
    return {"message": "Artigo excluido"}

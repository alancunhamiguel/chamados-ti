"""SuporteBot: assistente de TI dentro do chat, respondido pela Claude.

Como funciona:
1. O historico recente do usuario (tabela bot_conversations) vira o contexto da
   conversa, entao o bot lembra o que ja foi dito para aquela pessoa.
2. A base de conhecimento (tabela bot_knowledge, mantida pela equipe de TI) entra
   no prompt de sistema. E assim que o bot vai "aprendendo" com o tempo.
3. O bot tem ferramentas para consultar chamados resolvidos (solucoes antigas),
   listar os chamados do usuario e abrir um chamado quando nao resolve sozinho.

Dois provedores (BOT_PROVIDER):
- `api`: API da Anthropic por token (SDK `anthropic`), com tool use nativo.
- `claude_cli`: Claude Code CLI da assinatura do Grupo, via conteiner
  `chamados-claude` (claude_server.js, mesmo padrao do fedhub-claude) ou binario
  local. O CLI roda com `--tools ""`, entao as ferramentas sao emuladas: o modelo
  devolve JSON tipado dizendo qual acao quer, o backend executa e reenvia o resultado.
"""

import json
import logging
import time
import uuid
from datetime import datetime, timezone

import anthropic
from sqlalchemy import select, delete, or_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.config import get_settings
from app.models.bot_conversation import BotConversation, BotKnowledge
from app.models.comment import TicketComment
from app.models.ticket import Ticket, Sector
from app.models.user import User
from app.services import claude_cli

settings = get_settings()
logger = logging.getLogger(__name__)

MAX_TOOL_ROUNDS = 6
MAX_KNOWLEDGE_CHARS = 80_000
MAX_TOKENS = 4096

PRIORITY_LABELS = {"low": "Baixa", "medium": "Media", "high": "Alta", "critical": "Critica"}
STATUS_LABELS = {
    "open": "Aberto",
    "in_progress": "Em andamento",
    "waiting": "Aguardando",
    "resolved": "Resolvido",
    "closed": "Encerrado",
}


class BotNotConfigured(Exception):
    """ANTHROPIC_API_KEY nao definida."""


class BotUnavailable(Exception):
    """Falha ao falar com a API (rede, limite, chave invalida...)."""


# --------------------------------------------------------------------------- #
# Cliente
# --------------------------------------------------------------------------- #

_client: anthropic.AsyncAnthropic | None = None

PROVIDER_API = "api"
PROVIDER_CLI = "claude_cli"


def provider() -> str | None:
    """Provedor efetivo: "api", "claude_cli" ou None (bot desativado).

    BOT_PROVIDER=auto: API se houver ANTHROPIC_API_KEY, senao CLI se houver
    CLAUDE_URL ou CLAUDE_CONFIG_DIR. Forcar `claude_cli` permite o modo local
    com o `claude` do PATH.
    """
    escolha = (settings.BOT_PROVIDER or "auto").strip().lower()
    tem_chave = bool(settings.ANTHROPIC_API_KEY.strip())
    tem_cli = bool(settings.CLAUDE_URL.strip() or settings.CLAUDE_CONFIG_DIR.strip())
    if escolha == PROVIDER_API:
        return PROVIDER_API if tem_chave else None
    if escolha == PROVIDER_CLI:
        return PROVIDER_CLI
    if tem_chave:
        return PROVIDER_API
    if tem_cli:
        return PROVIDER_CLI
    return None


def is_configured() -> bool:
    return provider() is not None


_cli_status_cache: dict = {"at": 0.0, "data": None}
CLI_STATUS_TTL_S = 30


async def _cli_status_cached() -> dict:
    agora = time.monotonic()
    if _cli_status_cache["data"] is None or agora - _cli_status_cache["at"] > CLI_STATUS_TTL_S:
        _cli_status_cache["data"] = await claude_cli.status()
        _cli_status_cache["at"] = agora
    return _cli_status_cache["data"]


async def get_status(db: AsyncSession) -> dict:
    """Diagnostico para GET /api/bot/status (nunca expoe chave/token)."""
    prov = provider()
    articles = await list_knowledge(db, only_active=True)
    info = {
        "configured": prov is not None,
        "provider": prov,
        "model": "",
        "detail": "Defina ANTHROPIC_API_KEY (API) ou CLAUDE_URL (conteiner chamados-claude) no backend/.env",
        "knowledge_articles": len(articles),
    }
    if prov == PROVIDER_API:
        info["model"] = settings.BOT_MODEL
        info["detail"] = "API da Anthropic"
    elif prov == PROVIDER_CLI:
        st = await _cli_status_cached()
        info["model"] = settings.BOT_CLI_MODEL or "padrao da assinatura"
        info["configured"] = bool(st.get("logado"))
        info["detail"] = f"Claude Code ({st.get('detalhe', '?')})" if st.get("logado") else f"Claude Code sem login: {st.get('detalhe', '?')}"
    return info


def _get_client() -> anthropic.AsyncAnthropic:
    global _client
    if not settings.ANTHROPIC_API_KEY:
        raise BotNotConfigured()
    if _client is None:
        _client = anthropic.AsyncAnthropic(
            api_key=settings.ANTHROPIC_API_KEY,
            timeout=120.0,
            max_retries=2,
        )
    return _client


# --------------------------------------------------------------------------- #
# Prompt de sistema
# --------------------------------------------------------------------------- #

SYSTEM_BASE = """Voce e o SuporteBot, o assistente de suporte de TI do Grupo FedCorp. Voce vive dentro do Sistema de Chamados TI (helpdesk interno) e conversa com colaboradores, tecnicos e administradores pelo chat do sistema.

## Sobre o Sistema de Chamados TI
- Colaboradores abrem chamados com titulo, descricao, setor, categoria, prioridade e anexos. A equipe de TI (tecnicos e admins) atende.
- Fluxo de status: Aberto -> Em andamento -> Aguardando -> Resolvido -> Encerrado. Quando o chamado fica "Resolvido", o proprio colaborador confirma a solucao (encerra) ou devolve (volta para Em andamento).
- SLA por prioridade: Critica 4h, Alta 8h, Media 24h, Baixa 72h.
- Cada chamado tem comentarios, anexos, historico e um chat em tempo real com a equipe. O chat de cada chamado aparece no mesmo painel flutuante onde voce esta.
- Menu lateral: "Chamados" (lista), "Novo Chamado", "Dashboard" (so equipe de TI) e "Admin" (so administradores).

## Como atender
- Responda sempre em portugues do Brasil, de forma amigavel, objetiva e profissional.
- Para procedimentos, use passos numerados curtos. Pergunte o que falta (sistema operacional, mensagem de erro exata, desde quando acontece) antes de chutar.
- Use a BASE DE CONHECIMENTO INTERNA como fonte principal: ela foi escrita pela equipe de TI desta empresa e vale mais do que conhecimento generico.
- Antes de responder sobre um problema que parece recorrente (impressora, VPN, e-mail, sistema interno, acesso), use a ferramenta buscar_chamados_resolvidos para ver como a equipe resolveu casos parecidos e aproveite a solucao.
- Se o problema nao se resolve pelo chat (precisa de acesso fisico, permissao, troca de equipamento, reset de senha etc.), ofereca abrir um chamado. So chame abrir_chamado depois que o usuario confirmar explicitamente, e resuma o problema com os detalhes ja coletados. Depois informe o numero do chamado.
- Use meus_chamados quando o usuario perguntar sobre o andamento de chamados dele.
- Nunca peca senhas, nunca invente credenciais, caminhos de rede ou politicas que nao estejam na base de conhecimento. Se nao souber, diga que nao tem essa informacao e sugira o chamado.
- Nao oriente acoes destrutivas (formatar, apagar perfis, desativar antivirus) sem antes sugerir falar com a equipe de TI.
- Formatacao: o chat mostra texto simples. Pode usar listas com "-" ou "1.", e **negrito** para destacar. Nao use tabelas, cabecalhos markdown nem blocos de codigo longos.
- Mantenha respostas curtas (ate umas 10 linhas), a nao ser que o usuario peca um passo a passo completo.
"""


def _knowledge_block(articles: list[BotKnowledge]) -> str:
    if not articles:
        return (
            "## BASE DE CONHECIMENTO INTERNA\n"
            "(ainda vazia: a equipe de TI ainda nao cadastrou artigos. Responda com conhecimento geral "
            "e, quando for algo especifico da empresa, oriente a abrir chamado.)"
        )
    parts = ["## BASE DE CONHECIMENTO INTERNA (escrita pela equipe de TI; fonte confiavel)"]
    total = 0
    for art in articles:
        entry = f"\n### {art.title.strip()}"
        if art.category:
            entry += f" [{art.category.strip()}]"
        entry += f"\n{art.content.strip()}\n"
        total += len(entry)
        if total > MAX_KNOWLEDGE_CHARS:
            parts.append("\n(base de conhecimento truncada por tamanho)")
            break
        parts.append(entry)
    return "".join(parts)


def _user_block(user: User) -> str:
    role = {"admin": "administrador", "technician": "tecnico de TI", "employee": "colaborador"}.get(user.role, user.role)
    today = datetime.now(timezone.utc).strftime("%d/%m/%Y")
    return (
        "## Usuario desta conversa\n"
        f"- Nome: {user.name}\n"
        f"- E-mail: {user.email}\n"
        f"- Setor: {user.sector}\n"
        f"- Perfil no sistema: {role}\n"
        f"- Data de hoje: {today}\n"
        "Trate o usuario pelo primeiro nome."
    )


def _build_system(articles: list[BotKnowledge], user: User) -> list[dict]:
    # Regras + base de conhecimento sao iguais para todos os usuarios: cache de prompt
    # nesse prefixo. O bloco do usuario vem depois do breakpoint e varia por pessoa.
    return [
        {"type": "text", "text": SYSTEM_BASE},
        {"type": "text", "text": _knowledge_block(articles), "cache_control": {"type": "ephemeral"}},
        {"type": "text", "text": _user_block(user)},
    ]


# --------------------------------------------------------------------------- #
# Ferramentas
# --------------------------------------------------------------------------- #

TOOLS: list[dict] = [
    {
        "name": "buscar_chamados_resolvidos",
        "description": (
            "Busca chamados ja resolvidos ou encerrados no sistema cujo titulo ou categoria contenha o termo, "
            "e retorna as respostas publicas que a equipe de TI deu neles. Use para reaproveitar solucoes "
            "de problemas parecidos antes de responder."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "termo": {
                    "type": "string",
                    "description": "Palavra-chave curta do problema (ex.: 'impressora', 'VPN', 'senha', 'Outlook').",
                }
            },
            "required": ["termo"],
            "additionalProperties": False,
        },
    },
    {
        "name": "meus_chamados",
        "description": "Lista os chamados abertos (nao encerrados) do usuario desta conversa, com status, prioridade, responsavel e prazo de SLA.",
        "strict": True,
        "input_schema": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    },
    {
        "name": "abrir_chamado",
        "description": (
            "Abre um chamado de TI em nome do usuario desta conversa. Chame SOMENTE depois que o usuario confirmar "
            "que quer abrir o chamado. O chamado fica no setor do usuario e a equipe de TI e notificada por e-mail."
        ),
        "strict": True,
        "input_schema": {
            "type": "object",
            "properties": {
                "titulo": {"type": "string", "description": "Titulo curto e claro do problema (ate 100 caracteres)."},
                "descricao": {
                    "type": "string",
                    "description": "Descricao completa: o que acontece, desde quando, mensagem de erro, o que ja foi tentado no chat.",
                },
                "prioridade": {
                    "type": "string",
                    "enum": ["low", "medium", "high", "critical"],
                    "description": "low = incomodo pequeno; medium = padrao; high = impede o trabalho de uma pessoa; critical = impede varias pessoas ou um setor.",
                },
                "categoria": {
                    "type": ["string", "null"],
                    "description": "Categoria livre, ex.: hardware, software, rede, acesso, email, impressora. Null se nao souber.",
                },
            },
            "required": ["titulo", "descricao", "prioridade", "categoria"],
            "additionalProperties": False,
        },
    },
]


def _fmt_dt(dt: datetime | None) -> str:
    if not dt:
        return "-"
    return dt.strftime("%d/%m/%Y %H:%M")


async def _tool_buscar_chamados_resolvidos(db: AsyncSession, termo: str) -> str:
    termo = (termo or "").strip()
    if len(termo) < 2:
        return "Termo de busca muito curto."
    pattern = f"%{termo}%"
    result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.comments).selectinload(TicketComment.user))
        .where(Ticket.status.in_(["resolved", "closed"]))
        .where(or_(Ticket.title.ilike(pattern), Ticket.category.ilike(pattern)))
        .order_by(Ticket.resolved_at.desc().nullslast(), Ticket.created_at.desc())
        .limit(5)
    )
    tickets = list(result.scalars().unique().all())
    if not tickets:
        return f"Nenhum chamado resolvido encontrado para '{termo}'."

    out = []
    for t in tickets:
        # So respostas publicas da equipe de TI: nada interno e nada do texto do colaborador,
        # para nao vazar dados pessoais de outros usuarios no chat.
        staff_replies = [
            c for c in sorted(t.comments, key=lambda c: c.created_at or datetime.min.replace(tzinfo=timezone.utc))
            if not c.is_internal and c.user and c.user.role in ("technician", "admin")
        ][-3:]
        lines = [f"Chamado #{t.ticket_number} - {t.title} (categoria: {t.category or 'n/a'}, status: {STATUS_LABELS.get(t.status, t.status)})"]
        if staff_replies:
            for c in staff_replies:
                lines.append(f"  Resposta da equipe ({c.user.name}): {c.message.strip()[:600]}")
        else:
            lines.append("  (sem resposta publica registrada; resolvido sem comentario)")
        out.append("\n".join(lines))
    return "\n\n".join(out)


async def _tool_meus_chamados(db: AsyncSession, user: User) -> str:
    result = await db.execute(
        select(Ticket)
        .options(selectinload(Ticket.assignee))
        .where(Ticket.created_by == user.id)
        .where(Ticket.status != "closed")
        .order_by(Ticket.created_at.desc())
        .limit(10)
    )
    tickets = list(result.scalars().all())
    if not tickets:
        return "O usuario nao tem chamados em aberto."
    lines = []
    for t in tickets:
        lines.append(
            f"#{t.ticket_number} - {t.title} | status: {STATUS_LABELS.get(t.status, t.status)} | "
            f"prioridade: {PRIORITY_LABELS.get(t.priority, t.priority)} | "
            f"responsavel: {t.assignee.name if t.assignee else 'ainda nao atribuido'} | "
            f"prazo SLA: {_fmt_dt(t.sla_deadline)} | aberto em: {_fmt_dt(t.created_at)}"
        )
    return "\n".join(lines)


async def _resolve_sector(db: AsyncSession, user: User) -> Sector | None:
    result = await db.execute(select(Sector).where(Sector.name.ilike(user.sector.strip())))
    sector = result.scalar_one_or_none()
    if sector:
        return sector
    result = await db.execute(select(Sector).where(Sector.name.ilike("TI")))
    sector = result.scalar_one_or_none()
    if sector:
        return sector
    result = await db.execute(select(Sector).where(Sector.is_active == True).order_by(Sector.name).limit(1))
    return result.scalar_one_or_none()


async def _tool_abrir_chamado(db: AsyncSession, user: User, args: dict) -> str:
    # Imports locais: ticket_service importa chat_service, e email_service importa
    # modelos; evita ciclo de import na carga do modulo.
    from app.services import ticket_service
    from app.services.chat_service import send_chat_message
    from app.services.email_service import notify_ticket_event

    titulo = (args.get("titulo") or "").strip()[:255]
    descricao = (args.get("descricao") or "").strip()
    prioridade = args.get("prioridade") or "medium"
    categoria = (args.get("categoria") or None)
    if prioridade not in PRIORITY_LABELS:
        prioridade = "medium"
    if not titulo or not descricao:
        return "Erro: titulo e descricao sao obrigatorios."

    sector = await _resolve_sector(db, user)
    if not sector:
        return "Erro: nenhum setor cadastrado no sistema; peca ao usuario para abrir o chamado pelo menu Novo Chamado."

    descricao_final = f"{descricao}\n\n(Chamado aberto pelo SuporteBot a pedido de {user.name}.)"
    ticket = await ticket_service.create_ticket(
        db, user.id, titulo, descricao_final, sector.id, categoria, prioridade,
    )
    await db.flush()
    await db.refresh(ticket, ["creator", "assignee", "sector"])

    hora = datetime.now(timezone.utc).strftime("%d/%m/%Y às %H:%M")
    system_msg = (
        f"Chamado #{ticket.ticket_number} aberto em {hora} por {user.name} (via SuporteBot).\n"
        f"Titulo: {ticket.title}\n"
        f"Setor: {ticket.sector.name if ticket.sector else 'N/A'}\n"
        f"Categoria: {ticket.category or 'N/A'}\n"
        f"Prioridade: {ticket.priority}"
    )
    await send_chat_message(db, ticket.id, user.id, system_msg, is_system=True)
    try:
        await notify_ticket_event(ticket, user, "created", db)
    except Exception:  # e-mail nunca pode derrubar a resposta do bot
        logger.exception("Falha ao notificar abertura de chamado pelo bot")

    return (
        f"Chamado #{ticket.ticket_number} aberto com sucesso. Prioridade {PRIORITY_LABELS[prioridade]}, "
        f"prazo de SLA: {_fmt_dt(ticket.sla_deadline)}. O usuario pode acompanhar em Chamados > #{ticket.ticket_number}."
    )


async def _execute_tool(db: AsyncSession, user: User, name: str, args: dict) -> str:
    if name == "buscar_chamados_resolvidos":
        return await _tool_buscar_chamados_resolvidos(db, str(args.get("termo", "")))
    if name == "meus_chamados":
        return await _tool_meus_chamados(db, user)
    if name == "abrir_chamado":
        return await _tool_abrir_chamado(db, user, args)
    return f"Ferramenta desconhecida: {name}"


# --------------------------------------------------------------------------- #
# Historico / base de conhecimento (persistencia)
# --------------------------------------------------------------------------- #

async def get_conversation_history(db: AsyncSession, user_id: uuid.UUID) -> list[BotConversation]:
    result = await db.execute(
        select(BotConversation)
        .where(BotConversation.user_id == user_id)
        .order_by(BotConversation.created_at.asc(), BotConversation.id.asc())
    )
    return list(result.scalars().all())


async def save_message(db: AsyncSession, user_id: uuid.UUID, role: str, content: str) -> BotConversation:
    msg = BotConversation(
        user_id=user_id,
        role=role,
        content=content,
        created_at=datetime.now(timezone.utc),
    )
    db.add(msg)
    await db.flush()
    await db.refresh(msg)
    return msg


async def clear_conversation(db: AsyncSession, user_id: uuid.UUID) -> int:
    result = await db.execute(delete(BotConversation).where(BotConversation.user_id == user_id))
    return result.rowcount or 0


async def list_knowledge(db: AsyncSession, only_active: bool = False) -> list[BotKnowledge]:
    stmt = select(BotKnowledge).options(selectinload(BotKnowledge.author))
    if only_active:
        stmt = stmt.where(BotKnowledge.is_active == True)
    stmt = stmt.order_by(BotKnowledge.category.asc().nullslast(), BotKnowledge.title.asc())
    result = await db.execute(stmt)
    return list(result.scalars().all())


async def get_knowledge(db: AsyncSession, knowledge_id: uuid.UUID) -> BotKnowledge | None:
    result = await db.execute(
        select(BotKnowledge).options(selectinload(BotKnowledge.author)).where(BotKnowledge.id == knowledge_id)
    )
    return result.scalar_one_or_none()


async def create_knowledge(db: AsyncSession, user_id: uuid.UUID, title: str, content: str, category: str | None) -> BotKnowledge:
    art = BotKnowledge(
        title=title.strip(),
        content=content.strip(),
        category=(category or "").strip() or None,
        created_by=user_id,
        created_at=datetime.now(timezone.utc),
    )
    db.add(art)
    await db.flush()
    await db.refresh(art, ["author"])
    return art


async def update_knowledge(db: AsyncSession, art: BotKnowledge, **fields) -> BotKnowledge:
    for key, value in fields.items():
        if value is None:
            continue
        if key in ("title", "content"):
            value = value.strip()
        if key == "category":
            value = value.strip() or None
        setattr(art, key, value)
    art.updated_at = datetime.now(timezone.utc)
    await db.flush()
    await db.refresh(art, ["author"])
    return art


async def delete_knowledge(db: AsyncSession, art: BotKnowledge) -> None:
    await db.delete(art)
    await db.flush()


# --------------------------------------------------------------------------- #
# Conversa com a Claude
# --------------------------------------------------------------------------- #

def _history_to_messages(history: list[BotConversation]) -> list[dict]:
    recent = history[-settings.BOT_MAX_HISTORY:]
    # A API exige que a conversa comece com uma mensagem do usuario.
    while recent and recent[0].role != "user":
        recent = recent[1:]
    return [{"role": m.role, "content": m.content} for m in recent if m.content.strip()]


async def _call_claude(db: AsyncSession, user: User, system: list[dict], messages: list[dict]) -> str:
    """Loop de ferramentas: chama a API ate a Claude responder em texto."""
    client = _get_client()
    extra: dict = {}
    if settings.BOT_FALLBACKS:
        # Se um pedido for recusado pelos filtros de seguranca do modelo principal, a
        # propria API reexecuta em um modelo alternativo em vez de devolver vazio.
        extra = {"betas": ["server-side-fallback-2026-07-01"], "fallbacks": "default"}

    for _ in range(MAX_TOOL_ROUNDS):
        response = await client.beta.messages.create(
            model=settings.BOT_MODEL,
            max_tokens=MAX_TOKENS,
            output_config={"effort": settings.BOT_EFFORT},
            system=system,
            tools=TOOLS,
            messages=messages,
            **extra,
        )

        if response.stop_reason == "refusal":
            return (
                "Desculpe, nao posso ajudar com esse pedido especifico. "
                "Se for um problema de TI, descreva de outra forma ou abra um chamado para a equipe."
            )

        # Devolve o conteudo completo (inclui blocos de thinking/tool_use) no proximo turno.
        messages.append({"role": "assistant", "content": response.content})

        if response.stop_reason == "tool_use":
            results = []
            for block in response.content:
                if block.type != "tool_use":
                    continue
                args = block.input if isinstance(block.input, dict) else {}
                logger.info("SuporteBot tool %s por %s: %s", block.name, user.email, json.dumps(args, ensure_ascii=False)[:300])
                try:
                    output = await _execute_tool(db, user, block.name, args)
                    results.append({"type": "tool_result", "tool_use_id": block.id, "content": output})
                except Exception as exc:
                    logger.exception("Erro na ferramenta %s", block.name)
                    results.append({
                        "type": "tool_result",
                        "tool_use_id": block.id,
                        "content": f"Erro ao executar {block.name}: {exc}",
                        "is_error": True,
                    })
            messages.append({"role": "user", "content": results})
            continue

        text = "".join(b.text for b in response.content if b.type == "text").strip()
        if response.stop_reason == "max_tokens":
            text += "\n\n(Resposta cortada por tamanho. Peca para eu continuar.)"
        return text or "Nao consegui gerar uma resposta. Pode reformular a pergunta?"

    return "Nao consegui concluir a consulta agora. Tente novamente ou abra um chamado para a equipe de TI."


# --------------------------------------------------------------------------- #
# Provedor claude_cli: Claude Code CLI (assinatura), sem ferramentas nativas.
# O modelo devolve JSON tipado (--json-schema) dizendo qual acao quer; o backend
# executa e reenvia o prompt com o resultado, ate receber "responder".
# --------------------------------------------------------------------------- #

CLI_ACOES = ["responder", "buscar_chamados_resolvidos", "meus_chamados", "abrir_chamado"]

# Sem "$schema" nem palavras fora do vocabulario: o validador do CLI e estrito
# (licao do FedHub, ia_client._claude_http).
CLI_SCHEMA: dict = {
    "type": "object",
    "properties": {
        "acao": {"type": "string", "enum": CLI_ACOES},
        "resposta": {"type": "string", "description": "Texto final para o usuario quando acao=responder; vazio nas demais."},
        "termo": {"type": "string", "description": "Palavra-chave para buscar_chamados_resolvidos."},
        "chamado": {
            "type": "object",
            "properties": {
                "titulo": {"type": "string"},
                "descricao": {"type": "string"},
                "prioridade": {"type": "string", "enum": ["low", "medium", "high", "critical"]},
                "categoria": {"type": "string"},
            },
            "required": ["titulo", "descricao", "prioridade"],
        },
    },
    "required": ["acao", "resposta"],
}

CLI_TOOLS_TEXT = """## Formato de resposta (OBRIGATORIO)
Responda SEMPRE com um unico JSON, sem texto fora dele:
{"acao": "...", "resposta": "...", "termo": "...", "chamado": {"titulo": "...", "descricao": "...", "prioridade": "...", "categoria": "..."}}

Acoes:
- "responder": resposta final ao usuario em "resposta" (texto do chat, nas regras acima).
- "buscar_chamados_resolvidos": consulta chamados ja resolvidos cujo titulo/categoria contenha "termo" e devolve as respostas publicas da equipe de TI. Use antes de responder problemas recorrentes.
- "meus_chamados": lista os chamados em aberto do usuario desta conversa.
- "abrir_chamado": abre um chamado em nome do usuario com os dados em "chamado" (prioridade: low = incomodo pequeno; medium = padrao; high = impede o trabalho de uma pessoa; critical = impede varias pessoas ou um setor). SOMENTE depois que o usuario confirmar explicitamente.

Quando usar uma acao diferente de "responder", deixe "resposta" vazia. O sistema executa a acao e reenvia este prompt com o resultado na secao RESULTADOS DE FERRAMENTAS; ai responda ao usuario com "acao": "responder". Nunca repita uma acao que ja aparece nos resultados.
"""


def _build_cli_prompt(articles: list[BotKnowledge], user: User, history_msgs: list[dict], message: str, tool_results: list[str]) -> str:
    partes = [SYSTEM_BASE, _knowledge_block(articles), "", _user_block(user), "", CLI_TOOLS_TEXT, "## Conversa ate agora"]
    if history_msgs:
        for m in history_msgs:
            rotulo = "Usuario" if m["role"] == "user" else "SuporteBot"
            partes.append(f"{rotulo}: {m['content']}")
    else:
        partes.append("(primeira mensagem desta conversa)")
    partes += ["", "## Nova mensagem do usuario", message]
    if tool_results:
        partes += ["", "## RESULTADOS DE FERRAMENTAS (desta rodada)"] + tool_results
        partes.append("\nAgora responda ao usuario com \"acao\": \"responder\".")
    return "\n".join(partes)


def _parse_cli_output(texto: str) -> dict:
    """JSON validado pelo CLI; se vier texto solto, vira resposta direta."""
    texto = (texto or "").strip()
    try:
        dados = json.loads(texto)
    except (json.JSONDecodeError, TypeError):
        ini, fim = texto.find("{"), texto.rfind("}")
        dados = None
        if ini != -1 and fim > ini:
            try:
                dados = json.loads(texto[ini:fim + 1])
            except json.JSONDecodeError:
                dados = None
        if dados is None:
            return {"acao": "responder", "resposta": texto}
    if not isinstance(dados, dict):
        return {"acao": "responder", "resposta": texto}
    if dados.get("acao") not in CLI_ACOES:
        dados["acao"] = "responder"
    return dados


def _cli_action_args(dados: dict) -> dict:
    acao = dados.get("acao")
    if acao == "buscar_chamados_resolvidos":
        return {"termo": str(dados.get("termo") or "")}
    if acao == "abrir_chamado":
        chamado = dados.get("chamado") if isinstance(dados.get("chamado"), dict) else {}
        return {
            "titulo": chamado.get("titulo") or "",
            "descricao": chamado.get("descricao") or "",
            "prioridade": chamado.get("prioridade") or "medium",
            "categoria": chamado.get("categoria") or None,
        }
    return {}


async def _call_claude_cli(db: AsyncSession, user: User, articles: list[BotKnowledge], history_msgs: list[dict], message: str) -> str:
    """Loop de ferramentas emuladas sobre `claude -p --json-schema`. Levanta ClaudeCliError."""
    tool_results: list[str] = []
    executadas: set[str] = set()

    for _ in range(MAX_TOOL_ROUNDS):
        prompt = _build_cli_prompt(articles, user, history_msgs, message, tool_results)
        saida = await claude_cli.exec_prompt(prompt, schema=CLI_SCHEMA)
        dados = _parse_cli_output(saida)
        acao = dados["acao"]

        if acao == "responder":
            texto = str(dados.get("resposta") or "").strip()
            return texto or "Nao consegui gerar uma resposta. Pode reformular a pergunta?"

        args = _cli_action_args(dados)
        chave = f"{acao}:{json.dumps(args, sort_keys=True, ensure_ascii=False)}"
        if chave in executadas:
            tool_results.append(f"[{acao}] ja executada nesta rodada; use o resultado acima e responda.")
            continue
        executadas.add(chave)
        logger.info("SuporteBot (cli) acao %s por %s: %s", acao, user.email, json.dumps(args, ensure_ascii=False)[:300])
        try:
            resultado = await _execute_tool(db, user, acao, args)
        except Exception as exc:
            logger.exception("Erro na ferramenta %s (cli)", acao)
            resultado = f"Erro ao executar {acao}: {exc}"
        tool_results.append(f"[{acao} {json.dumps(args, ensure_ascii=False)}]\n{resultado}")

    return "Nao consegui concluir a consulta agora. Tente novamente ou abra um chamado para a equipe de TI."


async def ask_claude(db: AsyncSession, user: User, message: str) -> BotConversation:
    """Responde a mensagem do usuario e persiste o par pergunta/resposta.

    Levanta BotNotConfigured (sem provedor) ou BotUnavailable (falha na API/CLI);
    nesses casos nada e gravado, para o historico nao ficar com mensagens de erro.
    """
    prov = provider()
    if prov is None:
        raise BotNotConfigured()

    history = await get_conversation_history(db, user.id)
    articles = await list_knowledge(db, only_active=True)
    history_msgs = _history_to_messages(history)

    if prov == PROVIDER_CLI:
        try:
            answer = await _call_claude_cli(db, user, articles, history_msgs, message)
        except claude_cli.ClaudeCliError as exc:
            logger.error("SuporteBot (cli): %s", exc)
            raise BotUnavailable(str(exc)) from exc
        await save_message(db, user.id, "user", message)
        return await save_message(db, user.id, "assistant", answer)

    system = _build_system(articles, user)
    messages = history_msgs + [{"role": "user", "content": message}]

    try:
        answer = await _call_claude(db, user, system, messages)
    except anthropic.AuthenticationError as exc:
        logger.error("SuporteBot: chave da API invalida: %s", exc)
        raise BotUnavailable("Chave da API da Anthropic invalida. Avise o administrador.") from exc
    except anthropic.RateLimitError as exc:
        logger.warning("SuporteBot: rate limit: %s", exc)
        raise BotUnavailable("O SuporteBot esta recebendo muitas mensagens agora. Tente de novo em instantes.") from exc
    except anthropic.APIStatusError as exc:
        logger.error("SuporteBot: erro da API (%s): %s", exc.status_code, exc.message)
        raise BotUnavailable("O SuporteBot esta temporariamente indisponivel. Tente novamente em instantes.") from exc
    except anthropic.APIConnectionError as exc:
        logger.error("SuporteBot: falha de conexao com a API: %s", exc)
        raise BotUnavailable("Nao foi possivel conectar ao SuporteBot. Verifique a internet do servidor.") from exc

    await save_message(db, user.id, "user", message)
    return await save_message(db, user.id, "assistant", answer)

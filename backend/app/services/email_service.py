import asyncio
import os
from html import escape as _esc
from datetime import datetime, timezone
import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings, BASE_DIR
from app.models.user import User

settings = get_settings()

LOGS_DIR = os.path.join(BASE_DIR, "logs")
EMAIL_LOG_FILE = os.path.join(LOGS_DIR, "emails.log")

STATUS_NAMES = {
    "open": "Aberto",
    "in_progress": "Em andamento",
    "waiting": "Aguardando resposta",
    "resolved": "Resolvido",
    "closed": "Encerrado",
}

PRIORITY_NAMES = {
    "low": "Baixa",
    "medium": "Media",
    "high": "Alta",
    "critical": "Critica",
}


def _log_email(to: str, subject: str, body_html: str) -> None:
    """Dev mode: grava o e-mail em logs/emails.log quando o SMTP nao esta configurado."""
    os.makedirs(LOGS_DIR, exist_ok=True)
    now = datetime.now(timezone.utc).isoformat(timespec="seconds")
    with open(EMAIL_LOG_FILE, "a", encoding="utf-8") as f:
        f.write(f"\n{'='*60}\n")
        f.write(f"[{now}] To: {to}\nSubject: {subject}\n")
        f.write(body_html)
        f.write("\n")


_EMAIL_TASKS: set[asyncio.Task] = set()


async def _deliver_email(to: str, subject: str, body_html: str) -> None:
    """Envia de fato pelo SMTP. Falhas caem no log local, nunca propagam."""
    try:
        message = MIMEMultipart("alternative")
        message["From"] = settings.EMAIL_FROM
        message["To"] = to
        message["Subject"] = subject
        message.attach(MIMEText(body_html, "html"))

        await aiosmtplib.send(
            message,
            hostname=settings.SMTP_HOST,
            port=settings.SMTP_PORT,
            start_tls=True,
            username=settings.SMTP_USER,
            password=settings.SMTP_PASS,
            timeout=settings.SMTP_TIMEOUT,
        )
    except Exception as e:
        _log_email(
            to,
            subject,
            f"<p>FALHA NO ENVIO SMTP: {type(e).__name__}: {e}</p>"
            f"<p>Assunto original: {subject}</p><hr/>{body_html}",
        )


async def send_email(to: str, subject: str, body_html: str) -> bool:
    """Agenda o envio do e-mail e retorna na hora.

    O SMTP roda em background (create_task) para nao bloquear a resposta HTTP:
    um evento de chamado notifica varios destinatarios e cada envio pode levar
    segundos. Sem SMTP configurado, apenas grava em logs/emails.log.
    """
    if not settings.SMTP_USER or not settings.SMTP_PASS:
        _log_email(to, subject, body_html)
        return True

    task = asyncio.create_task(_deliver_email(to, subject, body_html))
    _EMAIL_TASKS.add(task)
    task.add_done_callback(_EMAIL_TASKS.discard)
    return True


def build_new_ticket_email(ticket_number: int, title: str, creator_name: str, priority: str) -> str:
    title = _esc(title)
    creator_name = _esc(creator_name)
    priority = _esc(priority)
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #F4F6F9; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #0066FF; color: #fff; padding: 20px 24px;">
                <h2 style="margin: 0; font-size: 18px;">Novo Chamado #{ticket_number}</h2>
            </div>
            <div style="padding: 24px;">
                <p><strong>Titulo:</strong> {title}</p>
                <p><strong>Criado por:</strong> {creator_name}</p>
                <p><strong>Prioridade:</strong> {priority}</p>
                <p style="margin-top: 16px; color: #475569;">Acesse o sistema para mais detalhes.</p>
            </div>
        </div>
    </body>
    </html>
    """


def build_assigned_email(ticket_number: int, title: str, assigner_name: str) -> str:
    title = _esc(title)
    assigner_name = _esc(assigner_name)
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #F4F6F9; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #0066FF; color: #fff; padding: 20px 24px;">
                <h2 style="margin: 0; font-size: 18px;">Chamado #{ticket_number} Atribuido a Voce</h2>
            </div>
            <div style="padding: 24px;">
                <p><strong>Titulo:</strong> {title}</p>
                <p><strong>Atribuido por:</strong> {assigner_name}</p>
                <p style="margin-top: 16px; color: #475569;">Acesse o sistema para atender este chamado.</p>
            </div>
        </div>
    </body>
    </html>
    """


def build_comment_email(ticket_number: int, title: str, commenter_name: str, message: str) -> str:
    title = _esc(title)
    commenter_name = _esc(commenter_name)
    message = _esc(message)
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #F4F6F9; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #0066FF; color: #fff; padding: 20px 24px;">
                <h2 style="margin: 0; font-size: 18px;">Novo Comentario no Chamado #{ticket_number}</h2>
            </div>
            <div style="padding: 24px;">
                <p><strong>Titulo:</strong> {title}</p>
                <p><strong>Por:</strong> {commenter_name}</p>
                <p style="background: #F4F6F9; padding: 12px; border-radius: 8px; {""}>{message}</p>
            </div>
        </div>
    </body>
    </html>
    """


def build_status_changed_email(ticket_number: int, title: str, old_status: str, new_status: str) -> str:
    title = _esc(title)
    old_status = _esc(old_status)
    new_status = _esc(new_status)
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #F4F6F9; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #0066FF; color: #fff; padding: 20px 24px;">
                <h2 style="margin: 0; font-size: 18px;">Status do Chamado #{ticket_number} Alterado</h2>
            </div>
            <div style="padding: 24px;">
                <p><strong>Titulo:</strong> {title}</p>
                <p><strong>De:</strong> {old_status} <strong>Para:</strong> {new_status}</p>
            </div>
        </div>
    </body>
    </html>
    """


def _build_html(header: str, rows: list[tuple[str, str]]) -> str:
    rows_html = "".join(
        f"<p><strong>{_esc(label)}:</strong> {_esc(value)}</p>" for label, value in rows
    )
    return f"""
    <html>
    <body style="font-family: Arial, sans-serif; background: #F4F6F9; padding: 24px;">
        <div style="max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
            <div style="background: #0066FF; color: #fff; padding: 20px 24px;">
                <h2 style="margin: 0; font-size: 18px;">{header}</h2>
            </div>
            <div style="padding: 24px;">
                {rows_html}
                <p style="margin-top: 16px; color: #475569;">Acesse o sistema para mais detalhes.</p>
            </div>
        </div>
    </body>
    </html>
    """


def build_update_email(ticket_number: int, title: str, actor_name: str, changes: list[tuple[str, str, str]]) -> str:
    rows: list[tuple[str, str]] = [
        ("Titulo", title),
        ("Responsavel", actor_name),
    ]
    for label, old, new in changes:
        rows.append((label, f"{old} -> {new}"))
    return _build_html(f"Chamado #{ticket_number} atualizado", rows)


async def notify_ticket_event(ticket, actor, event: str, db: AsyncSession | None = None) -> None:
    """Best-effort email notification on ticket events.

    Sends to the ticket creator for created/status events, and to all
    staff members on ticket creation. Never raises.
    """
    try:
        if event == "created":
            subject = f"Novo Chamado #{ticket.ticket_number}"
            body = build_new_ticket_email(ticket.ticket_number, ticket.title, actor.name, ticket.priority)
        else:
            return
        recipients = set()
        if ticket.creator and ticket.creator.email:
            recipients.add(ticket.creator.email)
        if event == "created" and db is not None:
            staff = await db.execute(
                select(User.email).where(
                    User.role.in_(["technician", "admin"]),
                    User.is_active == True,
                )
            )
            for (email,) in staff.all():
                if email:
                    recipients.add(email)
        for to in recipients:
            await send_email(to, subject, body)
    except Exception:
        return


async def notify_comment(ticket, commenter, message: str, is_internal: bool = False) -> None:
    """Notify the interested parties of a new comment on a ticket.

    Only public comments are notified to the creator and the assignee
    (internal comments are staff-only by design). Never raises.
    """
    if is_internal:
        return
    try:
        subject = f"Novo Comentario - Chamado #{ticket.ticket_number}"
        body = build_comment_email(ticket.ticket_number, ticket.title, commenter.name, message)

        recipients = set()
        if ticket.creator and ticket.creator.email and ticket.creator.id != commenter.id:
            recipients.add(ticket.creator.email)
        if ticket.assignee and ticket.assignee.email and ticket.assignee.id != commenter.id:
            recipients.add(ticket.assignee.email)

        for to in recipients:
            await send_email(to, subject, body)
    except Exception:
        return


async def notify_assignment(ticket, assigner) -> None:
    """Notify the assignee (you have a ticket) and the creator (who is responsible now)."""
    try:
        if ticket.assignee and ticket.assignee.email and ticket.assignee.id != assigner.id:
            subject = f"Chamado #{ticket.ticket_number} atribuido a voce"
            body = build_assigned_email(ticket.ticket_number, ticket.title, assigner.name)
            await send_email(ticket.assignee.email, subject, body)

        if (
            ticket.creator
            and ticket.creator.email
            and ticket.creator.id != assigner.id
            and (not ticket.assignee or ticket.creator.id != ticket.assignee.id)
        ):
            assignee_name = ticket.assignee.name if ticket.assignee else "um responsavel"
            body = _build_html(
                f"Chamado #{ticket.ticket_number} com responsavel",
                [
                    ("Titulo", ticket.title),
                    ("Atribuido a", assignee_name),
                    ("Atribuido por", assigner.name),
                ],
            )
            await send_email(
                ticket.creator.email,
                f"Chamado #{ticket.ticket_number} atribuido a {assignee_name}",
                body,
            )
    except Exception:
        return


async def notify_status_change(ticket, actor, old_status: str, new_status: str) -> None:
    """Always notify the creator of status changes (solutions, closings, etc.)."""
    try:
        old_label = STATUS_NAMES.get(old_status, old_status)
        new_label = STATUS_NAMES.get(new_status, new_status)
        body = build_status_changed_email(ticket.ticket_number, ticket.title, old_label, new_label)

        if new_status == "resolved":
            subject = f"Solucao apresentada - Chamado #{ticket.ticket_number}"
        elif new_status == "closed":
            subject = f"Chamado #{ticket.ticket_number} encerrado"
        elif new_status == "in_progress" and old_status == "resolved":
            subject = f"Chamado #{ticket.ticket_number} reaberto"
        elif new_status == "in_progress":
            subject = f"Chamado #{ticket.ticket_number} em andamento"
        elif new_status == "waiting":
            subject = f"Chamado #{ticket.ticket_number} aguardando resposta"
        else:
            subject = f"Chamado #{ticket.ticket_number} - status alterado"

        recipients = set()
        if ticket.creator and ticket.creator.email and ticket.creator.id != actor.id:
            recipients.add(ticket.creator.email)
        # No encerramento, o responsavel tambem e avisado (criador fechou/cancelou).
        if new_status == "closed" and ticket.assignee and ticket.assignee.email and ticket.assignee.id != actor.id:
            recipients.add(ticket.assignee.email)

        for to in recipients:
            await send_email(to, subject, body)
    except Exception:
        return


async def notify_ticket_updated(ticket, actor, changes: list[tuple[str, str, str]]) -> None:
    """Notify the creator when the responsible person edits ticket data."""
    try:
        if not changes:
            return
        subject = f"Chamado #{ticket.ticket_number} atualizado"
        body = build_update_email(ticket.ticket_number, ticket.title, actor.name, changes)
        if ticket.creator and ticket.creator.email and ticket.creator.id != actor.id:
            await send_email(ticket.creator.email, subject, body)
    except Exception:
        return


async def notify_priority_changed(ticket, actor, old_priority: str, new_priority: str) -> None:
    try:
        old_label = PRIORITY_NAMES.get(old_priority, old_priority)
        new_label = PRIORITY_NAMES.get(new_priority, new_priority)
        subject = f"Prioridade alterada - Chamado #{ticket.ticket_number}"
        body = _build_html(
            subject,
            [
                ("Titulo", ticket.title),
                ("Responsavel", actor.name),
                ("Prioridade", f"{old_label} -> {new_label}"),
            ],
        )
        if ticket.creator and ticket.creator.email and ticket.creator.id != actor.id:
            await send_email(ticket.creator.email, subject, body)
    except Exception:
        return
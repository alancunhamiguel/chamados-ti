import aiosmtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from app.config import get_settings

settings = get_settings()


async def send_email(to: str, subject: str, body_html: str) -> bool:
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
        )
        return True
    except Exception:
        return False


def build_new_ticket_email(ticket_number: int, title: str, creator_name: str, priority: str) -> str:
    return f"""
    <html>
    <body>
        <h2>Novo Chamado #{ticket_number}</h2>
        <p><strong>Titulo:</strong> {title}</p>
        <p><strong>Criado por:</strong> {creator_name}</p>
        <p><strong>Prioridade:</strong> {priority}</p>
        <p>Acesse o sistema para mais detalhes.</p>
    </body>
    </html>
    """


def build_assigned_email(ticket_number: int, title: str, admin_name: str) -> str:
    return f"""
    <html>
    <body>
        <h2>Chamado #{ticket_number} Atribuido a Voce</h2>
        <p><strong>Titulo:</strong> {title}</p>
        <p><strong>Atribuido por:</strong> {admin_name}</p>
        <p>Acesse o sistema para atender este chamado.</p>
    </body>
    </html>
    """


def build_comment_email(ticket_number: int, title: str, commenter_name: str, message: str) -> str:
    return f"""
    <html>
    <body>
        <h2>Novo Comentario no Chamado #{ticket_number}</h2>
        <p><strong>Titulo:</strong> {title}</p>
        <p><strong>Por:</strong> {commenter_name}</p>
        <p><strong>Mensagem:</strong> {message}</p>
    </body>
    </html>
    """


def build_status_changed_email(ticket_number: int, title: str, old_status: str, new_status: str) -> str:
    return f"""
    <html>
    <body>
        <h2>Status do Chamado #{ticket_number} Alterado</h2>
        <p><strong>Titulo:</strong> {title}</p>
        <p><strong>De:</strong> {old_status} <strong>Para:</strong> {new_status}</p>
    </body>
    </html>
    """

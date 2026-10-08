from pydantic_settings import BaseSettings
from functools import lru_cache
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _resolve_env_file() -> str:
    """Resolve o .env independente do diretorio onde o app e iniciado.

    Prioridade: backend/.env (dev local) -> raiz do projeto /.env (docker).
    """
    candidates = [
        os.path.join(BASE_DIR, ".env"),
        os.path.join(os.path.dirname(BASE_DIR), ".env"),
    ]
    for path in candidates:
        if os.path.exists(path):
            return path
    return os.path.join(BASE_DIR, ".env")


class Settings(BaseSettings):
    DATABASE_URL: str = f"sqlite+aiosqlite:///{os.path.join(BASE_DIR, 'chamados.db')}"
    SECRET_KEY: str = "chamados-super-secret-key-change-in-production-32chars"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60
    REFRESH_TOKEN_EXPIRE_DAYS: int = 30
    SMTP_HOST: str = "smtp.gmail.com"
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASS: str = ""
    SMTP_TIMEOUT: int = 15
    EMAIL_FROM: str = "Chamados TI <chamados@empresa.com>"
    CORS_ORIGINS: str = "http://localhost:3000,http://localhost:5173"
    GOOGLE_CLIENT_ID: str = ""
    GOOGLE_CLIENT_SECRET: str = ""
    GOOGLE_ALLOWED_DOMAIN: str = "grupofedcorp.com.br"
    SEED_ENABLED: bool = True
    UPLOAD_DIR: str = "app/uploads"
    MAX_FILE_SIZE: int = 50 * 1024 * 1024

    # SuporteBot. Dois provedores:
    #   api        -> API da Anthropic por token (ANTHROPIC_API_KEY)
    #   claude_cli -> Claude Code CLI da assinatura do Grupo, via conteiner chamados-claude
    #                 (CLAUDE_URL, mesmo padrao do fedhub-claude) ou binario local (CLAUDE_BIN)
    # BOT_PROVIDER=auto escolhe: api se houver chave, senao claude_cli se houver CLAUDE_URL.
    BOT_PROVIDER: str = "auto"          # auto | api | claude_cli
    ANTHROPIC_API_KEY: str = ""
    BOT_MODEL: str = "claude-opus-5-5"  # modelo do provedor api
    BOT_EFFORT: str = "medium"          # low | medium | high | xhigh | max (provedor api)
    BOT_MAX_HISTORY: int = 40           # mensagens anteriores enviadas como contexto
    BOT_FALLBACKS: bool = True          # fallback automatico se o modelo recusar por politica (api)
    CLAUDE_URL: str = ""                # ex.: http://chamados-claude:8788 (claude_server.js)
    CLAUDE_TOKEN: str = ""              # header X-Claude-Token, se o claude_server.js exigir (CLAUDE_SERVER_TOKEN)
    CLAUDE_BIN: str = "claude"          # modo local sem CLAUDE_URL: binario do Claude Code CLI
    CLAUDE_CONFIG_DIR: str = ""         # modo local: pasta com o .credentials.json da conta do bot
    BOT_CLI_MODEL: str = ""             # modelo no CLI ("" = padrao do plano; ex.: sonnet, opus)
    BOT_CLI_TIMEOUT: int = 120          # segundos por chamada ao CLI

    class Config:
        env_file = _resolve_env_file()
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()

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

    class Config:
        env_file = _resolve_env_file()
        case_sensitive = True


@lru_cache
def get_settings() -> Settings:
    return Settings()

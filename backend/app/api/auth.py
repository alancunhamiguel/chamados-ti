import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.ext.asyncio import AsyncSession
from app.config import get_settings
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserCreate, UserLogin, UserResponse, UserUpdate, TokenResponse
from app.services.auth_service import (
    hash_password, create_access_token, create_refresh_token,
    decode_refresh_token, authenticate_user, get_user_by_id, verify_google_token,
)
from app.dependencies import get_current_user, require_admin

router = APIRouter()
settings = get_settings()


class OnlineStatusUpdate(BaseModel):
    online_status: str


class RefreshRequest(BaseModel):
    refresh_token: str


class GoogleLoginRequest(BaseModel):
    token: str


def generate_tokens(user: User) -> TokenResponse:
    data = {"sub": str(user.id), "role": user.role}
    access = create_access_token(data)
    refresh = create_refresh_token(data)
    return TokenResponse(
        access_token=access,
        refresh_token=refresh,
        user=UserResponse.model_validate(user),
    )


@router.post("/register", response_model=UserResponse)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Email ja cadastrado")

    user = User(
        name=data.name,
        email=data.email,
        password_hash=hash_password(data.password),
        sector=data.sector,
        role="employee",
    )
    db.add(user)
    await db.flush()
    return user


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    user = await authenticate_user(db, data.email, data.password)
    if not user:
        raise HTTPException(status_code=401, detail="Credenciais invalidas")
    return generate_tokens(user)


@router.post("/google", response_model=TokenResponse)
async def google_login(data: GoogleLoginRequest, db: AsyncSession = Depends(get_db)):
    if not settings.GOOGLE_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Login Google nao configurado")

    info = await verify_google_token(data.token, settings.GOOGLE_CLIENT_ID)
    if not info:
        raise HTTPException(status_code=400, detail="Token Google invalido")

    email = (info.get("email") or "").strip().lower()
    if not email or str(info.get("email_verified")).lower() != "true":
        raise HTTPException(status_code=400, detail="Email Google invalido ou nao verificado")

    domain = email.split("@")[-1].lower() if "@" in email else ""
    allowed = (settings.GOOGLE_ALLOWED_DOMAIN or "").strip().lower()
    if allowed and domain != allowed:
        raise HTTPException(status_code=403, detail="Permitido somente email da empresa")

    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()

    if user is None:
        name = (info.get("name") or email.split("@")[0]).strip()
        user = User(
            name=name,
            email=email,
            password_hash=None,
            sector="TI",
            role="employee",
        )
        db.add(user)
        try:
            await db.flush()
        except IntegrityError:
            await db.rollback()
            result = await db.execute(select(User).where(User.email == email))
            user = result.scalar_one_or_none()
    elif not user.is_active:
        raise HTTPException(status_code=403, detail="Usuario inativo")

    return generate_tokens(user)


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(data: RefreshRequest, db: AsyncSession = Depends(get_db)):
    payload = decode_refresh_token(data.refresh_token)
    if not payload:
        raise HTTPException(status_code=401, detail="Refresh token invalido ou expirado")

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status_code=401, detail="Refresh token invalido")

    user = await get_user_by_id(db, user_id)
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Usuario nao encontrado ou inativo")

    return generate_tokens(user)


@router.get("/me", response_model=UserResponse)
async def get_me(user: User = Depends(get_current_user)):
    return user


@router.put("/me/status", response_model=UserResponse)
async def update_online_status(
    data: OnlineStatusUpdate,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    valid = ["disponivel", "ocupado", "em_atendimento", "offline"]
    if data.online_status not in valid:
        raise HTTPException(status_code=400, detail=f"Status invalido. Opcoes: {', '.join(valid)}")
    user.online_status = data.online_status
    await db.flush()
    return user

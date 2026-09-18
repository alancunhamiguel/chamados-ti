import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr
from app.models.enums import UserRole, OnlineStatus


class UserCreate(BaseModel):
    name: str
    email: str
    password: str
    sector: str
    role: UserRole = UserRole.EMPLOYEE


class UserUpdate(BaseModel):
    name: str | None = None
    email: str | None = None
    sector: str | None = None
    role: UserRole | None = None
    is_active: bool | None = None


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: str
    role: UserRole
    sector: str
    avatar_url: str | None = None
    is_active: bool
    online_status: OnlineStatus = OnlineStatus.OFFLINE
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    user: UserResponse

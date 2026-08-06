import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.user import UserResponse, UserUpdate
from app.dependencies import require_admin, get_current_user

router = APIRouter()


@router.get("", response_model=list[UserResponse])
async def list_users(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).order_by(User.created_at.desc()))
    return list(result.scalars().all())


@router.get("/technicians", response_model=list[UserResponse])
async def list_technicians(db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.role.in_(["technician", "admin"]), User.is_active == True).order_by(User.name))
    return list(result.scalars().all())


@router.get("/team-status", response_model=list[UserResponse])
async def get_team_status(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    result = await db.execute(
        select(User).where(User.role.in_(["admin", "technician"]), User.is_active == True).order_by(User.name)
    )
    return list(result.scalars().all())


@router.get("/{user_id}", response_model=UserResponse)
async def get_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")
    return user


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(user_id: uuid.UUID, data: UserUpdate, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(user, field, value)

    return user


@router.delete("/{user_id}")
async def delete_user(user_id: uuid.UUID, db: AsyncSession = Depends(get_db), admin: User = Depends(require_admin)):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(status_code=404, detail="Usuario nao encontrado")

    user.is_active = False
    return {"message": "Usuario desativado"}

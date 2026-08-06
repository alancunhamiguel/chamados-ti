from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from pydantic import BaseModel
from app.database import get_db
from app.models.ticket import Sector
from app.schemas.ticket import SectorResponse
from app.dependencies import require_admin

router = APIRouter()


class SectorCreate(BaseModel):
    name: str
    description: str | None = None


class SectorUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


@router.get("", response_model=list[SectorResponse])
async def list_sectors(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Sector).where(Sector.is_active == True).order_by(Sector.name))
    return result.scalars().all()


@router.get("/all", response_model=list[SectorResponse])
async def list_all_sectors(db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    result = await db.execute(select(Sector).order_by(Sector.name))
    return result.scalars().all()


@router.post("", response_model=SectorResponse, status_code=201)
async def create_sector(data: SectorCreate, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    existing = await db.execute(select(Sector).where(Sector.name == data.name))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=400, detail="Setor ja existe")

    sector = Sector(name=data.name, description=data.description)
    db.add(sector)
    await db.flush()
    return sector


@router.put("/{sector_id}", response_model=SectorResponse)
async def update_sector(sector_id: str, data: SectorUpdate, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    import uuid
    try:
        sid = uuid.UUID(sector_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    result = await db.execute(select(Sector).where(Sector.id == sid))
    sector = result.scalar_one_or_none()
    if not sector:
        raise HTTPException(status_code=404, detail="Setor nao encontrado")

    update_data = data.model_dump(exclude_unset=True)
    for field, value in update_data.items():
        setattr(sector, field, value)

    return sector


@router.delete("/{sector_id}")
async def delete_sector(sector_id: str, db: AsyncSession = Depends(get_db), admin=Depends(require_admin)):
    import uuid
    try:
        sid = uuid.UUID(sector_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="ID invalido")

    result = await db.execute(select(Sector).where(Sector.id == sid))
    sector = result.scalar_one_or_none()
    if not sector:
        raise HTTPException(status_code=404, detail="Setor nao encontrado")

    sector.is_active = False
    return {"message": "Setor desativado"}

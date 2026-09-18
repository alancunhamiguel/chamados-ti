from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db
from app.models.user import User
from app.schemas.comment import DashboardStats
from app.dependencies import require_technician_or_admin
from app.services import dashboard_service

router = APIRouter()


@router.get("/stats", response_model=DashboardStats)
async def stats(db: AsyncSession = Depends(get_db), admin: User = Depends(require_technician_or_admin)):
    return await dashboard_service.get_stats(db)


@router.get("/by-status")
async def by_status(db: AsyncSession = Depends(get_db), admin: User = Depends(require_technician_or_admin)):
    return await dashboard_service.get_by_status(db)


@router.get("/by-priority")
async def by_priority(db: AsyncSession = Depends(get_db), admin: User = Depends(require_technician_or_admin)):
    return await dashboard_service.get_by_priority(db)


@router.get("/by-sector")
async def by_sector(db: AsyncSession = Depends(get_db), admin: User = Depends(require_technician_or_admin)):
    return await dashboard_service.get_by_sector(db)


@router.get("/by-technician")
async def by_technician(db: AsyncSession = Depends(get_db), admin: User = Depends(require_technician_or_admin)):
    return await dashboard_service.get_by_technician(db)


@router.get("/sla-compliance")
async def sla_compliance(db: AsyncSession = Depends(get_db), admin: User = Depends(require_technician_or_admin)):
    return await dashboard_service.get_sla_compliance(db)

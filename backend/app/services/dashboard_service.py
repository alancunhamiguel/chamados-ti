from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession
from app.models.ticket import Ticket, Sector
from app.models.user import User


async def get_stats(db: AsyncSession) -> dict:
    total = (await db.execute(select(func.count(Ticket.id)))).scalar() or 0
    open_count = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "open"))).scalar() or 0
    in_progress = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "in_progress"))).scalar() or 0
    resolved = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "resolved"))).scalar() or 0
    closed = (await db.execute(select(func.count(Ticket.id)).where(Ticket.status == "closed"))).scalar() or 0

    # Media de horas entre abertura (created_at) e resolucao (resolved_at).
    # Calculada em Python: SQLite nao aritmetica datas dentro do SQL (vira NULL/valor absurdo).
    avg_result = await db.execute(
        select(Ticket.created_at, Ticket.resolved_at).where(Ticket.resolved_at.isnot(None))
    )
    deltas = [
        (resolved - created).total_seconds() / 3600
        for created, resolved in avg_result.all()
    ]
    avg_hours = (sum(deltas) / len(deltas)) if deltas else None

    sla_breach = (await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.sla_deadline.isnot(None),
            Ticket.resolved_at > Ticket.sla_deadline
        )
    )).scalar() or 0

    return {
        "total_tickets": total,
        "open_tickets": open_count,
        "in_progress_tickets": in_progress,
        "resolved_tickets": resolved,
        "closed_tickets": closed,
        "avg_resolution_hours": round(avg_hours, 2) if avg_hours is not None else None,
        "sla_breach_count": sla_breach,
    }


async def get_by_status(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Ticket.status, func.count(Ticket.id)).group_by(Ticket.status)
    )
    return [{"status": row[0], "count": row[1]} for row in result.all()]


async def get_by_priority(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Ticket.priority, func.count(Ticket.id)).group_by(Ticket.priority)
    )
    return [{"priority": row[0], "count": row[1]} for row in result.all()]


async def get_by_sector(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Ticket.sector_id, func.count(Ticket.id)).group_by(Ticket.sector_id)
    )
    rows = result.all()
    sector_ids = [row[0] for row in rows]
    sector_names = {}
    if sector_ids:
        sectors_result = await db.execute(select(Sector).where(Sector.id.in_(sector_ids)))
        for sector in sectors_result.scalars().all():
            sector_names[sector.id] = sector.name

    return [
        {"sector_id": str(row[0]), "sector_name": sector_names.get(row[0], "Desconhecido"), "count": row[1]}
        for row in rows
    ]


async def get_by_technician(db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(Ticket.assigned_to, func.count(Ticket.id))
        .where(Ticket.assigned_to.isnot(None))
        .group_by(Ticket.assigned_to)
    )
    rows = result.all()
    tech_ids = [row[0] for row in rows]
    tech_names = {}
    if tech_ids:
        users_result = await db.execute(select(User).where(User.id.in_(tech_ids)))
        for user in users_result.scalars().all():
            tech_names[user.id] = user.name

    return [
        {"technician_id": str(row[0]), "technician_name": tech_names.get(row[0], "Desconhecido"), "count": row[1]}
        for row in rows
    ]


async def get_sla_compliance(db: AsyncSession) -> dict:
    total_with_sla = (await db.execute(
        select(func.count(Ticket.id)).where(Ticket.sla_deadline.isnot(None))
    )).scalar() or 0

    compliant = (await db.execute(
        select(func.count(Ticket.id)).where(
            Ticket.sla_deadline.isnot(None),
            Ticket.resolved_at <= Ticket.sla_deadline
        )
    )).scalar() or 0

    percentage = (compliant / total_with_sla * 100) if total_with_sla > 0 else 0

    return {
        "total_with_sla": total_with_sla,
        "compliant": compliant,
        "percentage": round(percentage, 2),
    }

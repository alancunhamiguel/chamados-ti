import asyncio
from sqlalchemy import select
from app.database import async_session, engine, Base
from app.models.user import User
from app.models.ticket import Sector
from app.services.auth_service import hash_password


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with async_session() as db:
        existing = await db.execute(select(User).where(User.email == "admin@empresa.com"))
        if existing.scalar_one_or_none():
            print("Seed ja executado")
            return

        sectors = ["TI", "RH", "Financeiro", "Comercial", "Operacoes", "Administrativo"]
        for name in sectors:
            sector = Sector(name=name)
            db.add(sector)

        await db.flush()

        users_data = [
            {"name": "Admin", "email": "admin@empresa.com", "password": "admin123", "sector": "TI", "role": "admin"},
            {"name": "Tecnico 1", "email": "tecnico1@empresa.com", "password": "tech123", "sector": "TI", "role": "technician"},
            {"name": "Tecnico 2", "email": "tecnico2@empresa.com", "password": "tech123", "sector": "TI", "role": "technician"},
            {"name": "Colaborador", "email": "colaborador@empresa.com", "password": "user123", "sector": "RH", "role": "employee"},
        ]

        for data in users_data:
            user = User(
                name=data["name"],
                email=data["email"],
                password_hash=hash_password(data["password"]),
                sector=data["sector"],
                role=data["role"],
            )
            db.add(user)

        await db.commit()
        print("Seed executado com sucesso!")


if __name__ == "__main__":
    asyncio.run(seed())

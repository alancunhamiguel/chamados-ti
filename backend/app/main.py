from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.router import api_router
from app.api.ws_chat import router as ws_router
from app.config import get_settings
from app.database import init_db, async_session
from app.models.user import User
from app.models.ticket import Sector
from app.services.auth_service import hash_password
from sqlalchemy import select

settings = get_settings()


async def seed_data():
    async with async_session() as db:
        existing = await db.execute(select(User).where(User.email == "admin@empresa.com"))
        if existing.scalar_one_or_none():
            return

        sectors = ["TI", "RH", "Financeiro", "Comercial", "Operacoes", "Administrativo"]
        sector_objs = []
        for name in sectors:
            sector = Sector(name=name)
            db.add(sector)
            sector_objs.append(sector)
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
        print("[SEED] Dados iniciais criados com sucesso!")


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    await seed_data()
    yield


app = FastAPI(title="Sistema de Chamados TI", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.CORS_ORIGINS.split(",")],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(ws_router)


@app.get("/health")
async def health_check():
    return {"status": "ok"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app.main:app", host="0.0.0.0", port=8000, reload=True)

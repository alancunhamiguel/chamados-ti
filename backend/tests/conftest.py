import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession
from app.database import Base, get_db
from app.main import app
from app.models.user import User
from app.models.ticket import Sector
from app.services.auth_service import hash_password, create_access_token

DATABASE_URL = "sqlite+aiosqlite:///./test.db"

engine = create_async_engine(DATABASE_URL, echo=False)
TestSessionLocal = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def override_get_db():
    async with TestSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


app.dependency_overrides[get_db] = override_get_db


@pytest_asyncio.fixture(autouse=True)
async def setup_database():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)


@pytest_asyncio.fixture
async def db():
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def seed_data(db: AsyncSession):
    sector = Sector(name="TI")
    db.add(sector)
    await db.flush()

    admin = User(
        name="Admin Test",
        email="admin@test.com",
        password_hash=hash_password("admin123"),
        sector="TI",
        role="admin",
    )
    technician = User(
        name="Tech Test",
        email="tech@test.com",
        password_hash=hash_password("tech123"),
        sector="TI",
        role="technician",
    )
    employee = User(
        name="Employee Test",
        email="employee@test.com",
        password_hash=hash_password("user123"),
        sector="RH",
        role="employee",
    )
    db.add_all([admin, technician, employee])
    await db.flush()
    await db.commit()
    return {"admin": admin, "technician": technician, "employee": employee, "sector": sector}


@pytest_asyncio.fixture
def admin_token(seed_data):
    return create_access_token({"sub": str(seed_data["admin"].id), "role": "admin"})


@pytest_asyncio.fixture
def tech_token(seed_data):
    return create_access_token({"sub": str(seed_data["technician"].id), "role": "technician"})


@pytest_asyncio.fixture
def employee_token(seed_data):
    return create_access_token({"sub": str(seed_data["employee"].id), "role": "employee"})

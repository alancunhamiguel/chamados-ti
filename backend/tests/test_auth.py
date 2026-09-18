import pytest
from unittest.mock import patch
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.api import auth as auth_module
from app.models.user import User

transport = ASGITransport(app=app)


@pytest.mark.asyncio
async def test_register(seed_data):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/auth/register", json={
            "name": "New User",
            "email": "new@test.com",
            "password": "test123",
            "sector": "TI",
        })
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == "New User"
        assert data["role"] == "employee"


@pytest.mark.asyncio
async def test_login(seed_data):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/auth/login", json={
            "email": "admin@test.com",
            "password": "admin123",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"


@pytest.mark.asyncio
async def test_login_invalid_credentials(seed_data):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/auth/login", json={
            "email": "admin@test.com",
            "password": "wrongpassword",
        })
        assert response.status_code == 401


@pytest.mark.asyncio
async def test_get_me(seed_data, admin_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me", headers={"Authorization": f"Bearer {admin_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == "admin@test.com"


@pytest.mark.asyncio
async def test_get_me_no_token():
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/auth/me")
        assert response.status_code == 403


GOOGLE_CLIENT_ID = "test-client-id"
GOOGLE_PAYLOAD = {
    "aud": GOOGLE_CLIENT_ID,
    "email": "joao.silva@grupofedcorp.com.br",
    "email_verified": "true",
    "name": "Joao Silva",
}


@pytest.mark.asyncio
async def test_google_login_creates_employee(db):
    with (
        patch.object(auth_module.settings, "GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID),
        patch("app.api.auth.verify_google_token", return_value=GOOGLE_PAYLOAD),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/auth/google", json={"token": "fake-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == "joao.silva@grupofedcorp.com.br"
        assert data["user"]["name"] == "Joao Silva"
        assert data["user"]["role"] == "employee"

    result = await db.execute(select(User).where(User.email == "joao.silva@grupofedcorp.com.br"))
    user = result.scalar_one()
    assert user.role == "employee"
    assert user.password_hash is None


@pytest.mark.asyncio
async def test_google_login_not_configured():
    with patch.object(auth_module.settings, "GOOGLE_CLIENT_ID", ""):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/auth/google", json={"token": "qualquer"})
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_google_login_blocks_non_company_domain():
    payload = dict(GOOGLE_PAYLOAD, email="joao.silva@gmail.com")
    with (
        patch.object(auth_module.settings, "GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID),
        patch("app.api.auth.verify_google_token", return_value=payload),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/auth/google", json={"token": "fake-token"})
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_google_login_reuses_existing_user(seed_data):
    payload = dict(GOOGLE_PAYLOAD, email="admin@test.com", name="Admin Test")
    with (
        patch.object(auth_module.settings, "GOOGLE_CLIENT_ID", GOOGLE_CLIENT_ID),
        patch.object(auth_module.settings, "GOOGLE_ALLOWED_DOMAIN", ""),
        patch("app.api.auth.verify_google_token", return_value=payload),
    ):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/auth/google", json={"token": "fake-token"})
        assert response.status_code == 200
        data = response.json()
        assert data["user"]["email"] == "admin@test.com"
        assert data["user"]["role"] == "admin"

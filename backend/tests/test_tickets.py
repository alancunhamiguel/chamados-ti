import pytest
from httpx import AsyncClient, ASGITransport
from app.main import app

transport = ASGITransport(app=app)


@pytest.mark.asyncio
async def test_create_ticket(seed_data, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tickets", json={
            "title": "Computador nao liga",
            "description": "Meu computador nao esta ligando",
            "sector_id": str(seed_data["sector"].id),
            "category": "hardware",
            "priority": "high",
        }, headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["title"] == "Computador nao liga"
        assert data["status"] == "open"
        assert data["priority"] == "high"


@pytest.mark.asyncio
async def test_list_tickets_employee(seed_data, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/tickets", json={
            "title": "Ticket 1",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {employee_token}"})

        response = await client.get("/api/tickets", headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 1


@pytest.mark.asyncio
async def test_list_tickets_technician(seed_data, tech_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/tickets", headers={"Authorization": f"Bearer {tech_token}"})
        assert response.status_code == 200


@pytest.mark.asyncio
async def test_update_status(seed_data, tech_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/api/tickets", json={
            "title": "Test Status",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {tech_token}"})
        ticket_id = create_resp.json()["id"]

        response = await client.put(f"/api/tickets/{ticket_id}/status", json={
            "status": "in_progress",
        }, headers={"Authorization": f"Bearer {tech_token}"})
        assert response.status_code == 200
        assert response.json()["status"] == "in_progress"


@pytest.mark.asyncio
async def test_invalid_status_transition(seed_data, tech_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/api/tickets", json={
            "title": "Test Invalid",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {tech_token}"})
        ticket_id = create_resp.json()["id"]

        response = await client.put(f"/api/tickets/{ticket_id}/status", json={
            "status": "closed",
        }, headers={"Authorization": f"Bearer {tech_token}"})
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_employee_cannot_change_status(seed_data, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/api/tickets", json={
            "title": "Test Perm",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {employee_token}"})
        ticket_id = create_resp.json()["id"]

        response = await client.put(f"/api/tickets/{ticket_id}/status", json={
            "status": "in_progress",
        }, headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 403

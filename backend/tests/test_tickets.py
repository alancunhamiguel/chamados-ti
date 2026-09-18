import pytest
import uuid
from datetime import datetime, timedelta, timezone
from httpx import AsyncClient, ASGITransport
from sqlalchemy import select
from app.main import app
from app.models.ticket import Ticket
from app.services import email_service

transport = ASGITransport(app=app)


@pytest.mark.asyncio
async def test_create_ticket(seed_data, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tickets", data={
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
async def test_create_ticket_with_attachments(seed_data, employee_token):
    files = [
        ("files", ("foto.png", b"png-bytes-fake", "image/png")),
        ("files", ("planilha.xlsx", b"xlsx-bytes-fake", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")),
    ]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tickets", data={
            "title": "Chamado com anexos",
            "description": "Testando upload junto",
            "sector_id": str(seed_data["sector"].id),
        }, files=files, headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 200
        ticket_id = response.json()["id"]

        list_resp = await client.get(
            f"/api/tickets/{ticket_id}/attachments",
            headers={"Authorization": f"Bearer {employee_token}"},
        )
        assert list_resp.status_code == 200
        attachments = list_resp.json()
        assert len(attachments) == 2
        names = {a["original_filename"] for a in attachments}
        assert names == {"foto.png", "planilha.xlsx"}


@pytest.mark.asyncio
async def test_create_ticket_rejects_bad_file(seed_data, employee_token):
    files = [("files", ("script.exe", b"malware", "application/x-dosexec"))]
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/api/tickets", data={
            "title": "Anexo invalido",
            "description": "Extensao nao permitida",
            "sector_id": str(seed_data["sector"].id),
        }, files=files, headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_list_tickets_employee(seed_data, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        await client.post("/api/tickets", data={
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
        create_resp = await client.post("/api/tickets", data={
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
        create_resp = await client.post("/api/tickets", data={
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
        create_resp = await client.post("/api/tickets", data={
            "title": "Test Perm",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {employee_token}"})
        ticket_id = create_resp.json()["id"]

        response = await client.put(f"/api/tickets/{ticket_id}/status", json={
            "status": "in_progress",
        }, headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 400


@pytest.mark.asyncio
async def test_creator_notified_on_status_edit_and_priority(seed_data, tech_token, employee_token, monkeypatch):
    sent = []

    async def fake_send_email(to, subject, body_html):
        sent.append((to, subject))

    monkeypatch.setattr(email_service, "send_email", fake_send_email)

    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/api/tickets", data={
            "title": "Notif Test",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {employee_token}"})
        assert create_resp.status_code == 200
        ticket_id = create_resp.json()["id"]

        status_resp = await client.put(f"/api/tickets/{ticket_id}/status", json={
            "status": "in_progress",
        }, headers={"Authorization": f"Bearer {tech_token}"})
        assert status_resp.status_code == 200
        assert any("em andamento" in subject.lower() for _, subject in sent)

        edit_resp = await client.put(f"/api/tickets/{ticket_id}", json={
            "description": "Nova descricao",
        }, headers={"Authorization": f"Bearer {tech_token}"})
        assert edit_resp.status_code == 200
        assert any("atualizado" in subject.lower() for _, subject in sent)

        priority_resp = await client.put(f"/api/tickets/{ticket_id}/priority", json={
            "priority": "high",
        }, headers={"Authorization": f"Bearer {tech_token}"})
        assert priority_resp.status_code == 200
        assert any("prioridade alterada" in subject.lower() for _, subject in sent)

        recipients = {to for to, _ in sent}
        assert seed_data["employee"].email in recipients

        sent.clear()
        own_edit = await client.put(f"/api/tickets/{ticket_id}", json={
            "description": "Edicao do proprio criador",
        }, headers={"Authorization": f"Bearer {employee_token}"})
        assert own_edit.status_code == 200
        assert not sent


@pytest.mark.asyncio
async def test_employee_cannot_access_other_ticket(seed_data, tech_token, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/api/tickets", data={
            "title": "Ticket do tecnico",
            "description": "Desc",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {tech_token}"})
        other_id = create_resp.json()["id"]

        for path in [
            f"/api/tickets/{other_id}",
            f"/api/tickets/{other_id}/comments",
            f"/api/tickets/{other_id}/history",
        ]:
            response = await client.get(path, headers={"Authorization": f"Bearer {employee_token}"})
            assert response.status_code == 403, f"{path} deveria bloquear colaborador"


@pytest.mark.asyncio
async def test_staff_access_dashboard_and_technicians(seed_data, tech_token, employee_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {tech_token}"})
        assert response.status_code == 200

        response = await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {employee_token}"})
        assert response.status_code == 403

        response = await client.get("/api/users/technicians", headers={"Authorization": f"Bearer {tech_token}"})
        assert response.status_code == 200

        response = await client.get("/api/users", headers={"Authorization": f"Bearer {tech_token}"})
        assert response.status_code == 403


@pytest.mark.asyncio
async def test_avg_resolution_hours_computed(seed_data, db, employee_token, tech_token, admin_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        create_resp = await client.post("/api/tickets", data={
            "title": "Chamado para media",
            "description": "Teste de tempo medio",
            "sector_id": str(seed_data["sector"].id),
        }, headers={"Authorization": f"Bearer {employee_token}"})
        assert create_resp.status_code == 200
        ticket_id = uuid.UUID(create_resp.json()["id"])

        result = await db.execute(select(Ticket).where(Ticket.id == ticket_id))
        ticket = result.scalar_one()
        ticket.created_at = datetime.now(timezone.utc) - timedelta(hours=2)
        await db.commit()

        assert (await client.put(
            f"/api/tickets/{ticket_id}/status",
            json={"status": "in_progress"},
            headers={"Authorization": f"Bearer {tech_token}"},
        )).status_code == 200
        assert (await client.put(
            f"/api/tickets/{ticket_id}/status",
            json={"status": "resolved"},
            headers={"Authorization": f"Bearer {tech_token}"},
        )).status_code == 200

        stats = (await client.get("/api/dashboard/stats", headers={"Authorization": f"Bearer {admin_token}"})).json()
        assert stats["avg_resolution_hours"] is not None
        assert abs(stats["avg_resolution_hours"] - 2.0) < 0.01

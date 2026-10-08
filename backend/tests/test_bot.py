import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services import bot_service

transport = ASGITransport(app=app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_chat_returns_503_when_not_configured(seed_data, employee_token):
    with patch.object(bot_service, "is_configured", return_value=False):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/bot/chat", json={"message": "oi"}, headers=_auth(employee_token))
    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]


@pytest.mark.asyncio
async def test_chat_saves_history_and_clears(seed_data, employee_token):
    async def fake_call(db, user, system, messages):
        # O prompt de sistema leva o nome do usuario e o ultimo turno e a pergunta.
        assert any(user.name in block["text"] for block in system)
        assert messages[-1] == {"role": "user", "content": "Minha impressora nao imprime"}
        return "Tente reiniciar a impressora."

    with patch.object(bot_service, "is_configured", return_value=True), \
         patch.object(bot_service, "_call_claude", side_effect=fake_call):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/bot/chat",
                json={"message": "Minha impressora nao imprime"},
                headers=_auth(employee_token),
            )
            assert response.status_code == 200
            assert response.json()["role"] == "assistant"
            assert response.json()["content"] == "Tente reiniciar a impressora."

            history = await client.get("/api/bot/history", headers=_auth(employee_token))
            assert history.status_code == 200
            roles = [m["role"] for m in history.json()]
            assert roles == ["user", "assistant"]

            cleared = await client.delete("/api/bot/history", headers=_auth(employee_token))
            assert cleared.status_code == 200
            assert cleared.json()["deleted_count"] == 2

            history = await client.get("/api/bot/history", headers=_auth(employee_token))
            assert history.json() == []


@pytest.mark.asyncio
async def test_chat_api_failure_returns_502_and_saves_nothing(seed_data, employee_token):
    with patch.object(bot_service, "is_configured", return_value=True), \
         patch.object(bot_service, "_call_claude", AsyncMock(side_effect=bot_service.BotUnavailable("fora do ar"))):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/bot/chat", json={"message": "oi"}, headers=_auth(employee_token))
            assert response.status_code == 502
            history = await client.get("/api/bot/history", headers=_auth(employee_token))
            assert history.json() == []


@pytest.mark.asyncio
async def test_knowledge_crud_requires_staff(seed_data, employee_token, tech_token):
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        denied = await client.post(
            "/api/bot/knowledge",
            json={"title": "VPN", "content": "Use o cliente X"},
            headers=_auth(employee_token),
        )
        assert denied.status_code == 403

        created = await client.post(
            "/api/bot/knowledge",
            json={"title": "Configurar VPN", "content": "1. Abra o cliente.\n2. Entre com o e-mail.", "category": "rede"},
            headers=_auth(tech_token),
        )
        assert created.status_code == 201
        art = created.json()
        assert art["is_active"] is True
        assert art["author_name"] == "Tech Test"

        updated = await client.put(
            f"/api/bot/knowledge/{art['id']}",
            json={"is_active": False, "category": ""},
            headers=_auth(tech_token),
        )
        assert updated.status_code == 200
        assert updated.json()["is_active"] is False
        assert updated.json()["category"] is None

        listed = await client.get("/api/bot/knowledge", headers=_auth(tech_token))
        assert listed.status_code == 200
        assert len(listed.json()) == 1

        status = await client.get("/api/bot/status", headers=_auth(employee_token))
        assert status.status_code == 200
        assert status.json()["knowledge_articles"] == 0  # artigo inativo nao conta

        deleted = await client.delete(f"/api/bot/knowledge/{art['id']}", headers=_auth(tech_token))
        assert deleted.status_code == 200
        assert (await client.get("/api/bot/knowledge", headers=_auth(tech_token))).json() == []


@pytest.mark.asyncio
async def test_knowledge_enters_system_prompt(seed_data, db):
    art = await bot_service.create_knowledge(db, seed_data["technician"].id, "Reset de senha", "Abra o portal e clique em Esqueci a senha.", "acesso")
    system = bot_service._build_system([art], seed_data["employee"])
    knowledge_text = system[1]["text"]
    assert "Reset de senha" in knowledge_text
    assert "[acesso]" in knowledge_text
    assert system[1]["cache_control"] == {"type": "ephemeral"}
    assert "Employee Test" in system[2]["text"]


@pytest.mark.asyncio
async def test_tool_abrir_chamado_creates_ticket(seed_data, db):
    employee = seed_data["employee"]
    with patch("app.services.email_service.notify_ticket_event", AsyncMock()):
        result = await bot_service._execute_tool(
            db, employee, "abrir_chamado",
            {"titulo": "Notebook nao liga", "descricao": "Nao da sinal de vida", "prioridade": "high", "categoria": "hardware"},
        )
    assert "aberto com sucesso" in result

    listed = await bot_service._execute_tool(db, employee, "meus_chamados", {})
    assert "Notebook nao liga" in listed
    assert "Alta" in listed

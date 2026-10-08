import json
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport
from app.main import app
from app.services import bot_service, claude_cli

transport = ASGITransport(app=app)


def _auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.mark.asyncio
async def test_chat_returns_503_when_not_configured(seed_data, employee_token):
    with patch.object(bot_service, "provider", return_value=None):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/bot/chat", json={"message": "oi"}, headers=_auth(employee_token))
            status = await client.get("/api/bot/status", headers=_auth(employee_token))
    assert response.status_code == 503
    assert "ANTHROPIC_API_KEY" in response.json()["detail"]
    assert status.json()["configured"] is False
    assert status.json()["provider"] is None


@pytest.mark.asyncio
async def test_chat_saves_history_and_clears(seed_data, employee_token):
    async def fake_call(db, user, system, messages):
        # O prompt de sistema leva o nome do usuario e o ultimo turno e a pergunta.
        assert any(user.name in block["text"] for block in system)
        assert messages[-1] == {"role": "user", "content": "Minha impressora nao imprime"}
        return "Tente reiniciar a impressora."

    with patch.object(bot_service, "provider", return_value="api"), \
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
    with patch.object(bot_service, "provider", return_value="api"), \
         patch.object(bot_service, "_call_claude", AsyncMock(side_effect=bot_service.BotUnavailable("fora do ar"))):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/bot/chat", json={"message": "oi"}, headers=_auth(employee_token))
            assert response.status_code == 502
            history = await client.get("/api/bot/history", headers=_auth(employee_token))
            assert history.json() == []


# ----------------------------- provedor claude_cli ------------------------- #

@pytest.mark.asyncio
async def test_cli_provider_runs_emulated_tool_loop(seed_data, employee_token):
    prompts: list[str] = []

    async def fake_exec(prompt, schema=None, model=None, timeout_s=None):
        prompts.append(prompt)
        assert schema is bot_service.CLI_SCHEMA
        if len(prompts) == 1:
            return json.dumps({"acao": "buscar_chamados_resolvidos", "resposta": "", "termo": "impressora"})
        return json.dumps({"acao": "responder", "resposta": "Reinicie a impressora e tente de novo."})

    with patch.object(bot_service, "provider", return_value="claude_cli"), \
         patch.object(claude_cli, "exec_prompt", side_effect=fake_exec):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post(
                "/api/bot/chat", json={"message": "Minha impressora nao imprime"}, headers=_auth(employee_token),
            )
            assert response.status_code == 200
            assert response.json()["content"] == "Reinicie a impressora e tente de novo."
            history = await client.get("/api/bot/history", headers=_auth(employee_token))
            assert [m["role"] for m in history.json()] == ["user", "assistant"]

    assert len(prompts) == 2
    # a secao de resultados so aparece a partir da segunda rodada (as instrucoes citam o nome)
    assert "## RESULTADOS DE FERRAMENTAS" not in prompts[0]
    assert "Employee Test" in prompts[0]
    assert "## RESULTADOS DE FERRAMENTAS" in prompts[1]
    assert "Nenhum chamado resolvido encontrado para 'impressora'" in prompts[1]


@pytest.mark.asyncio
async def test_cli_provider_error_returns_502(seed_data, employee_token):
    with patch.object(bot_service, "provider", return_value="claude_cli"), \
         patch.object(claude_cli, "exec_prompt", AsyncMock(side_effect=claude_cli.ClaudeCliError("Conta Claude do SuporteBot sem login."))):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            response = await client.post("/api/bot/chat", json={"message": "oi"}, headers=_auth(employee_token))
            assert response.status_code == 502
            assert "sem login" in response.json()["detail"]
            history = await client.get("/api/bot/history", headers=_auth(employee_token))
            assert history.json() == []


@pytest.mark.asyncio
async def test_cli_status_reports_login(seed_data, employee_token):
    bot_service._cli_status_cache["data"] = None
    with patch.object(bot_service, "provider", return_value="claude_cli"), \
         patch.object(claude_cli, "status", AsyncMock(return_value={"instalado": True, "logado": True, "detalhe": "claude.ai / plano team"})):
        async with AsyncClient(transport=transport, base_url="http://test") as client:
            status = await client.get("/api/bot/status", headers=_auth(employee_token))
    bot_service._cli_status_cache["data"] = None
    assert status.status_code == 200
    assert status.json()["configured"] is True
    assert status.json()["provider"] == "claude_cli"
    assert "plano team" in status.json()["detail"]


def test_parse_cli_output_fallbacks():
    assert bot_service._parse_cli_output('{"acao": "responder", "resposta": "ok"}') == {"acao": "responder", "resposta": "ok"}
    # texto com JSON embutido
    assert bot_service._parse_cli_output('Segue: {"acao": "meus_chamados", "resposta": ""} fim')["acao"] == "meus_chamados"
    # texto solto vira resposta direta
    assert bot_service._parse_cli_output("Tente reiniciar.") == {"acao": "responder", "resposta": "Tente reiniciar."}
    # acao desconhecida cai em responder
    assert bot_service._parse_cli_output('{"acao": "formatar", "resposta": "x"}')["acao"] == "responder"


def test_cli_error_mapping():
    assert "sem login" in str(claude_cli._mapear_erro("claude falhou (not logged in)", "http"))
    assert "Limite de uso" in str(claude_cli._mapear_erro("usage limit reached", "http"))
    assert "Claude Code falhou" in str(claude_cli._mapear_erro("boom", "rc=1"))


class _FakeResponse:
    def __init__(self, status_code: int, payload: dict):
        self.status_code = status_code
        self._payload = payload

    def json(self):
        return self._payload


class _FakeAsyncClient:
    """Substitui httpx.AsyncClient: guarda a chamada e devolve a resposta programada."""
    calls: list = []
    response: _FakeResponse = _FakeResponse(200, {"ok": True, "resposta": "oi"})

    def __init__(self, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False

    async def post(self, url, json=None, headers=None):
        _FakeAsyncClient.calls.append({"url": url, "json": json, "headers": headers})
        return _FakeAsyncClient.response


@pytest.mark.asyncio
async def test_exec_http_sends_token_header_and_maps_401():
    _FakeAsyncClient.calls.clear()
    _FakeAsyncClient.response = _FakeResponse(200, {"ok": True, "resposta": '{"acao":"responder","resposta":"oi"}'})
    with patch.object(claude_cli.settings, "CLAUDE_URL", "http://192.168.0.100:8788"), \
         patch.object(claude_cli.settings, "CLAUDE_TOKEN", "segredo"), \
         patch.object(claude_cli.httpx, "AsyncClient", _FakeAsyncClient):
        saida = await claude_cli.exec_prompt("ola", schema={"type": "object"}, model="sonnet", timeout_s=30)
    assert saida == '{"acao":"responder","resposta":"oi"}'
    chamada = _FakeAsyncClient.calls[0]
    assert chamada["url"] == "http://192.168.0.100:8788/exec"
    assert chamada["headers"] == {"X-Claude-Token": "segredo"}
    assert chamada["json"] == {"prompt": "ola", "timeout_s": 30, "schema": {"type": "object"}, "model": "sonnet"}

    _FakeAsyncClient.response = _FakeResponse(401, {"ok": False, "erro": "token inválido: envie o header X-Claude-Token"})
    with patch.object(claude_cli.settings, "CLAUDE_URL", "http://192.168.0.100:8788"), \
         patch.object(claude_cli.settings, "CLAUDE_TOKEN", "errado"), \
         patch.object(claude_cli.httpx, "AsyncClient", _FakeAsyncClient):
        with pytest.raises(claude_cli.ClaudeCliError) as exc:
            await claude_cli.exec_prompt("ola")
    assert "CLAUDE_TOKEN" in str(exc.value)


# ----------------------------- base de conhecimento ------------------------- #

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

        with patch.object(bot_service, "provider", return_value="api"):
            status = await client.get("/api/bot/status", headers=_auth(employee_token))
        assert status.status_code == 200
        assert status.json()["knowledge_articles"] == 0  # artigo inativo nao conta
        assert status.json()["provider"] == "api"

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
    # o prompt do CLI leva o mesmo conteudo em texto unico
    cli_prompt = bot_service._build_cli_prompt([art], seed_data["employee"], [], "oi", [])
    assert "Reset de senha" in cli_prompt and "Formato de resposta" in cli_prompt


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

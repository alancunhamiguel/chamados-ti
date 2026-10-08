"""Cliente do Claude Code CLI para o SuporteBot (provedor `claude_cli`).

Dois modos, iguais aos do FedHub (ia_client.py, ADR-0052):
- HTTP: CLAUDE_URL aponta para o claude_server.js do conteiner `chamados-claude`
  (ou do `fedhub-claude`). E o modo de producao.
- Local: sem CLAUDE_URL, roda `claude -p` no proprio processo, usando o binario
  CLAUDE_BIN e, se definido, CLAUDE_CONFIG_DIR com o .credentials.json da conta do bot.

Em ambos: `--tools ""` (o CLI e so cliente de modelo), `--permission-prompts none`,
`--no-session-persistence`, prompt pelo stdin e, com `schema`, resposta validada em
`structured_output`.
"""

import asyncio
import json
import logging
import os
import shutil
import tempfile
from typing import Any

import httpx

from app.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


class ClaudeCliError(Exception):
    """Falha ao executar o CLI (sem login, limite de uso, servico fora, timeout)."""


def _mapear_erro(erro: str, origem: str) -> ClaudeCliError:
    baixo = erro.lower()
    if "não autenticado" in baixo or "nao autenticado" in baixo or "unauthorized" in baixo or "401" in baixo or "not logged" in baixo or "login" in baixo:
        return ClaudeCliError(
            "Conta Claude do SuporteBot sem login. Recopie claude_home/.credentials.json de uma sessao `claude` autenticada com a conta do bot."
        )
    if "usage limit" in baixo or "rate limit" in baixo or "429" in baixo or "overloaded" in baixo:
        return ClaudeCliError("Limite de uso da assinatura Claude atingido. Tente mais tarde.")
    return ClaudeCliError(f"Claude Code falhou ({origem}): {erro[-300:] or 'sem detalhes'}")


def _url() -> str:
    return settings.CLAUDE_URL.strip().rstrip("/")


# --------------------------------------------------------------------------- #
# status
# --------------------------------------------------------------------------- #

async def status() -> dict[str, Any]:
    """{instalado, logado, detalhe, versao, modo}. Nunca expoe credenciais."""
    url = _url()
    if url:
        try:
            async with httpx.AsyncClient(timeout=25) as client:
                r = await client.get(f"{url}/status")
            dados = r.json() if r.status_code == 200 else {}
            return {
                "modo": "http",
                "servico": url,
                "instalado": bool(dados.get("instalado")),
                "logado": bool(dados.get("logado")),
                "detalhe": dados.get("detalhe") or f"HTTP {r.status_code}",
                "versao": dados.get("versao"),
            }
        except Exception as exc:  # rede, DNS, JSON invalido
            return {"modo": "http", "servico": url, "instalado": False, "logado": False, "detalhe": f"servico {url} inacessivel: {exc}"}

    binario = shutil.which(settings.CLAUDE_BIN)
    if not binario:
        return {"modo": "local", "instalado": False, "logado": False, "detalhe": f"binario '{settings.CLAUDE_BIN}' nao encontrado no PATH"}
    env = dict(os.environ)
    if settings.CLAUDE_CONFIG_DIR:
        env["CLAUDE_CONFIG_DIR"] = settings.CLAUDE_CONFIG_DIR
    try:
        proc = await asyncio.create_subprocess_exec(
            binario, "auth", "status", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env,
        )
        stdout, _ = await asyncio.wait_for(proc.communicate(), timeout=20)
        try:
            dados = json.loads(stdout.decode("utf-8", errors="replace") or "{}")
        except json.JSONDecodeError:
            dados = {}
        logado = bool(dados.get("loggedIn"))
        detalhe = f"{dados.get('authMethod', '?')} / plano {dados.get('subscriptionType', '?')}" if logado else "nao autenticado"
        return {"modo": "local", "instalado": True, "logado": logado, "detalhe": detalhe[:200]}
    except asyncio.TimeoutError:
        return {"modo": "local", "instalado": True, "logado": False, "detalhe": "claude auth status nao respondeu"}


# --------------------------------------------------------------------------- #
# exec
# --------------------------------------------------------------------------- #

async def exec_prompt(prompt: str, schema: dict | None = None, model: str | None = None, timeout_s: int | None = None) -> str:
    """Roda uma chamada `claude -p` e devolve o texto da resposta.

    Com `schema`, devolve o JSON (string) do `structured_output` validado pelo CLI.
    Levanta ClaudeCliError em qualquer falha.
    """
    timeout_s = timeout_s or settings.BOT_CLI_TIMEOUT
    model = (model if model is not None else settings.BOT_CLI_MODEL).strip()
    if _url():
        return await _exec_http(prompt, schema, model, timeout_s)
    return await _exec_local(prompt, schema, model, timeout_s)


async def _exec_http(prompt: str, schema: dict | None, model: str, timeout_s: int) -> str:
    url = _url()
    corpo: dict[str, Any] = {"prompt": prompt, "timeout_s": int(timeout_s)}
    if schema:
        corpo["schema"] = schema
    if model:
        corpo["model"] = model
    headers = {"X-Claude-Token": settings.CLAUDE_TOKEN.strip()} if settings.CLAUDE_TOKEN.strip() else {}
    try:
        async with httpx.AsyncClient(timeout=timeout_s + 30) as client:
            r = await client.post(f"{url}/exec", json=corpo, headers=headers)
    except httpx.HTTPError as exc:
        raise ClaudeCliError(f"Servico do Claude ({url}) inacessivel: {exc}") from exc
    try:
        dados = r.json()
    except ValueError:
        raise ClaudeCliError(f"Servico do Claude respondeu HTTP {r.status_code} sem JSON")
    if r.status_code == 200 and dados.get("ok"):
        return str(dados.get("resposta", ""))
    erro = f"{dados.get('erro', '')} {dados.get('stderr', '')}".strip()
    logger.error("chamados-claude falhou (HTTP %s): %s", r.status_code, erro[-1500:])
    if r.status_code == 401 and "token" in erro.lower():
        raise ClaudeCliError("O servico do Claude exige token: confira CLAUDE_TOKEN no backend/.env (igual ao CLAUDE_SERVER_TOKEN do servidor).")
    raise _mapear_erro(erro or f"HTTP {r.status_code}", "http")


async def _exec_local(prompt: str, schema: dict | None, model: str, timeout_s: int) -> str:
    binario = shutil.which(settings.CLAUDE_BIN)
    if not binario:
        raise ClaudeCliError(
            f"Claude Code CLI nao encontrado ('{settings.CLAUDE_BIN}'). Instale com `npm i -g @anthropic-ai/claude-code` ou defina CLAUDE_URL."
        )
    cmd = [binario, "-p", "--output-format", "json", "--tools", "", "--permission-prompts", "none", "--no-session-persistence"]
    if model:
        cmd += ["--model", model]
    if schema:
        cmd += ["--json-schema", json.dumps(schema, ensure_ascii=False)]
    env = dict(os.environ)
    if settings.CLAUDE_CONFIG_DIR:
        env["CLAUDE_CONFIG_DIR"] = settings.CLAUDE_CONFIG_DIR

    with tempfile.TemporaryDirectory(prefix="claude-") as tmp:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdin=asyncio.subprocess.PIPE, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE, env=env, cwd=tmp,
        )
        try:
            stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(prompt.encode("utf-8")), timeout=timeout_s)
        except asyncio.TimeoutError:
            proc.kill()
            raise ClaudeCliError(f"Claude Code CLI nao respondeu em {timeout_s}s")

    stdout = stdout_b.decode("utf-8", errors="replace")
    stderr = stderr_b.decode("utf-8", errors="replace")
    try:
        dados = json.loads(stdout or "{}")
    except json.JSONDecodeError:
        dados = {}
    if not dados or dados.get("is_error") or proc.returncode != 0:
        erro = str(dados.get("result") or stderr or stdout or "").strip()
        logger.error("claude -p falhou (rc=%s, subtype=%s): %s", proc.returncode, dados.get("subtype"), erro[-1500:])
        raise _mapear_erro(erro, f"rc={proc.returncode}")
    if dados.get("structured_output") is not None:
        return json.dumps(dados["structured_output"], ensure_ascii=False)
    return str(dados.get("result", ""))

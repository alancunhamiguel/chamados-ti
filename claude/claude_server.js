// claude/claude_server.js — micro-serviço HTTP do contêiner `chamados-claude`.
//
// Copiado de FedHub-Backend/src/tools/claude_server.js (ADR-0052/0053 do FedHub), sem
// mudança de contrato: expõe o Claude Code CLI autenticado com a conta Claude do
// chatbot (claude_home/.credentials.json) para o backend do Sistema de Chamados, na
// rede interna do compose. Sem dependências (só Node).
//
//   GET  /status            → {instalado, logado, detalhe, versao}
//   POST /exec               → body JSON {prompt, schema?, model?, timeout_s?, max_budget_usd?}
//                             → {ok:true, resposta, segundos} | {ok:false, erro, stderr?}
//   POST /exec-arquivo       → igual, com {arquivos:[{nome, base64}]} e a ferramenta Read
//                             liberada só para esses arquivos (não usado pelo SuporteBot)
//
// Cada /exec roda: claude -p --output-format json --tools "" --permission-prompts none
//   --no-session-persistence [--model <m>] [--json-schema <schema>] [--max-budget-usd <v>]
// com o prompt no stdin, em diretório temporário vazio. `--tools ""` desliga toda
// ferramenta (Bash/Edit/Write/...) — o CLI age só como cliente de modelo. Nada é
// persistido; o diretório é apagado.

const http = require("http");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, execFile } = require("child_process");

const PORT = Number(process.env.CLAUDE_SERVER_PORT || 8788);
const CLAUDE_BIN = process.env.CLAUDE_BIN || "claude";
const MAX_BODY = 50 * 1024 * 1024; // 50 MB de prompt
const TIMEOUT_PADRAO_S = Number(process.env.CLAUDE_TIMEOUT_S || 900); // 15 min
// Token compartilhado opcional: quando CLAUDE_SERVER_TOKEN está definido, /exec e
// /exec-arquivo exigem o header X-Claude-Token com o mesmo valor. Necessário se a
// porta for publicada fora da rede do compose (ex.: para outro host da rede local).
// /status continua aberto para o healthcheck do Docker.
const TOKEN = (process.env.CLAUDE_SERVER_TOKEN || "").trim();

function lerBody(req) {
  return new Promise((resolve, reject) => {
    let tamanho = 0;
    const partes = [];
    req.on("data", (c) => {
      tamanho += c.length;
      if (tamanho > MAX_BODY) { reject(new Error("body excede 50 MB")); req.destroy(); return; }
      partes.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(partes).toString("utf8")));
    req.on("error", reject);
  });
}

function json(res, status, obj) {
  const corpo = JSON.stringify(obj);
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Content-Length": Buffer.byteLength(corpo) });
  res.end(corpo);
}

function status() {
  return new Promise((resolve) => {
    execFile(CLAUDE_BIN, ["auth", "status"], { timeout: 20000 }, (err, stdout) => {
      if (err && err.code === "ENOENT") return resolve({ instalado: false, logado: false, detalhe: "claude não encontrado" });
      let dados = {};
      try { dados = JSON.parse(stdout || "{}"); } catch { /* stdout vazio/; segue com {} */ }
      const logado = !!dados.loggedIn;
      const detalhe = logado ? `${dados.authMethod || "?"} / plano ${dados.subscriptionType || "?"}` : "não autenticado — verifique claude_home/.credentials.json";
      execFile(CLAUDE_BIN, ["--version"], { timeout: 10000 }, (_e, v) => resolve({ instalado: true, logado, detalhe, versao: (v || "").trim() }));
    });
  });
}

/** Grava os arquivos recebidos (base64) no diretório temporário da execução.
 * Só nome simples: nada de caminho, `..` ou barra — o CLI não pode sair desta pasta. */
function gravarArquivos(tmp, arquivos) {
  for (const a of arquivos) {
    const nome = String((a && a.nome) || "");
    if (!nome || nome !== path.basename(nome) || nome.startsWith(".")) {
      throw new Error(`nome de arquivo inválido: ${nome || "(vazio)"}`);
    }
    fs.writeFileSync(path.join(tmp, nome), Buffer.from(String((a && a.base64) || ""), "base64"));
  }
}

function exec({ prompt, schema, model, timeout_s, max_budget_usd, arquivos, tools }) {
  return new Promise((resolve) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "claude-"));
    try {
      if (arquivos && arquivos.length) gravarArquivos(tmp, arquivos);
    } catch (e) {
      try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
      return resolve({ ok: false, erro: e.message });
    }
    // `--tools ""` (padrão) deixa o CLI só como cliente de modelo, como manda a ADR-0052.
    // O OCR (ADR-0053) pede "Read" para enxergar o sub-PDF que acabamos de gravar aqui.
    const args = ["-p", "--output-format", "json", "--tools", tools || "", "--permission-prompts", "none", "--no-session-persistence"];
    if (model) args.push("--model", model);
    if (schema) args.push("--json-schema", typeof schema === "string" ? schema : JSON.stringify(schema));
    if (max_budget_usd) args.push("--max-budget-usd", String(max_budget_usd));

    const inicio = Date.now();
    const proc = spawn(CLAUDE_BIN, args, { cwd: tmp, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "", stderr = "";
    const timer = setTimeout(() => proc.kill("SIGKILL"), (timeout_s || TIMEOUT_PADRAO_S) * 1000);
    proc.stdout.on("data", (d) => { stdout += d; });
    proc.stderr.on("data", (d) => { stderr += d; });
    proc.on("error", (e) => { clearTimeout(timer); limpar(); resolve({ ok: false, erro: e.code === "ENOENT" ? "claude não encontrado no contêiner" : e.message }); });
    proc.on("close", (code, signal) => {
      clearTimeout(timer);
      const segundos = Math.round((Date.now() - inicio) / 1000);
      if (signal === "SIGKILL") { limpar(); return resolve({ ok: false, erro: `claude -p excedeu ${timeout_s || TIMEOUT_PADRAO_S}s`, segundos }); }
      limpar();
      let dados = null;
      try { dados = JSON.parse(stdout); } catch { /* sem JSON válido */ }
      if (!dados) {
        console.error(`[claude] rc=${code} em ${segundos}s sem JSON: ${(stderr || stdout).slice(-800)}`);
        return resolve({ ok: false, erro: `claude -p rc=${code} sem JSON`, stderr: (stderr || stdout).slice(-2000), segundos });
      }
      if (dados.is_error || code !== 0) {
        const detalhe = String(dados.result || stderr || stdout);
        console.error(`[claude] rc=${code} em ${segundos}s (subtype=${dados.subtype}): ${detalhe.slice(-800)}`);
        return resolve({ ok: false, erro: `claude falhou (${dados.subtype || "erro"})`, stderr: detalhe.slice(-2000), segundos });
      }
      const resposta = dados.structured_output !== undefined ? JSON.stringify(dados.structured_output) : (dados.result || "");
      console.log(`[claude] ok em ${segundos}s (${resposta.length} chars, custo ref. US$ ${dados.total_cost_usd ?? "?"})`);
      resolve({ ok: true, resposta, segundos });
    });
    proc.stdin.on("error", () => {});
    proc.stdin.end(prompt);

    function limpar() { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} }
  });
}

http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/status") return json(res, 200, await status());
    if (req.method === "POST" && (req.url === "/exec" || req.url === "/exec-arquivo")) {
      if (TOKEN && String(req.headers["x-claude-token"] || "") !== TOKEN) {
        return json(res, 401, { ok: false, erro: "token inválido: envie o header X-Claude-Token" });
      }
      const comArquivo = req.url === "/exec-arquivo";
      let body;
      try { body = JSON.parse(await lerBody(req)); } catch (e) { return json(res, 400, { ok: false, erro: `JSON inválido: ${e.message}` }); }
      if (!body || typeof body.prompt !== "string" || !body.prompt.trim()) return json(res, 400, { ok: false, erro: "campo 'prompt' obrigatório" });
      if (comArquivo && (!Array.isArray(body.arquivos) || !body.arquivos.length)) {
        return json(res, 400, { ok: false, erro: "campo 'arquivos' obrigatório em /exec-arquivo" });
      }
      // /exec continua sem ferramenta nenhuma (ADR-0052); só /exec-arquivo libera a leitura,
      // e apenas dos arquivos que o próprio FedHub acabou de gravar na pasta temporária.
      // a ferramenta é decidida aqui, nunca pelo cliente
      const r = await exec(comArquivo
        ? { ...body, tools: "Read" }
        : { ...body, arquivos: null, tools: "" });
      return json(res, r.ok ? 200 : 502, r);
    }
    json(res, 404, { ok: false, erro: "use GET /status, POST /exec ou POST /exec-arquivo" });
  } catch (e) {
    json(res, 500, { ok: false, erro: e.message });
  }
}).listen(PORT, "0.0.0.0", () => console.log(`[claude-server] ouvindo em :${PORT} (bin=${CLAUDE_BIN}, CLAUDE_CONFIG_DIR=${process.env.CLAUDE_CONFIG_DIR || "~/.claude"}, token=${TOKEN ? "exigido" : "desligado"})`));

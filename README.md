# Sistema de Chamados TI

Sistema web completo para gestão de chamados de TI (helpdesk), permitindo que colaboradores abram chamados e que a equipe técnica gerencie, priorize e resolva-os.

## Funcionalidades

- **Criação de chamados** com título, descrição, setor, categoria, prioridade e anexos
- **Painel admin** com dashboard, gráficos e métricas
- **Fluxo de status** controlado (open -> in_progress -> waiting -> resolved -> closed)
- **SLA automático** por prioridade (crítica 4h, alta 8h, média 24h, baixa 72h)
- **Comentários** públicos e internos (só técnicos veem internos)
- **Upload de anexos** (imagens, PDFs, documentos) na criação e no detalhe do chamado
- **Histórico completo** de todas as ações
- **Notificações por e-mail** (templates prontos)
- **Chat em tempo real** por chamado (REST + WebSocket)
- **SuporteBot**: assistente de TI com Claude no painel de chats, com base de conhecimento alimentada pela equipe
- **Autenticação JWT** e **login com Google** (roles employee, technician, admin)
- **Permissões por role** (employee, technician, admin)

## Stack Técnica

| Camada   | Tecnologia                                 |
|----------|--------------------------------------------|
| Backend  | Python 3.11+ / FastAPI / SQLAlchemy async  |
| Banco    | PostgreSQL 15 (produção) / SQLite (dev)    |
| Frontend | React 18 / TypeScript / TailwindCSS / Vite |
| Auth     | JWT (+ Google OAuth)                       |
| Deploy   | Docker / Docker Compose                    |

## Início Rápido

### Backend (desenvolvimento local)

```bash
cd backend
python -m venv venv
venv\Scripts\activate          # Windows
pip install -r requirements-local.txt
python run.py
```

Backend: http://127.0.0.1:8000
Swagger: http://127.0.0.1:8000/docs

### Configuração de E-mail

Sem SMTP configurado o sistema **não envia** e-mails: grava todos em
`backend/logs/emails.log` (modo dev/fallback). Para enviar de verdade,
edite `backend\.env` e preencha as credenciais:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu.email@gmail.com
SMTP_PASS=sua-senha-de-app-do-gmail
EMAIL_FROM=Chamados TI <seu.email@gmail.com>
```

Notificações enviadas: novo chamado (ao criador + equipe TI), atribuição,
mudança de status (solução/encerramento) e novos comentários públicos.

### Configuração do Google OAuth (opcional)

Para habilitar o botão **Entrar com Google**:

1. Crie um OAuth Client (Web) no Google Cloud Console.
2. Em **Authorized JavaScript origins**, adicione `http://localhost:3000` e `http://127.0.0.1:3000`.
3. Preencha no `backend/.env`: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` e `GOOGLE_ALLOWED_DOMAIN`.
4. No `frontend/.env`: `VITE_GOOGLE_CLIENT_ID` com o mesmo Client ID.

### Configuração do SuporteBot (Claude)

O SuporteBot aparece para todos no painel de chats (botão flutuante no canto inferior direito).
Ele responde dúvidas de TI, consulta chamados já resolvidos para reaproveitar soluções, lista os
chamados do usuário e abre um chamado em nome dele quando o problema não se resolve pelo chat.
Há duas formas de ligar o bot; `BOT_PROVIDER=auto` escolhe sozinho (API se houver chave, senão CLI).

**Opção A: API da Anthropic (cobrança por token)**

1. Crie uma chave no Console da Anthropic (https://platform.claude.com, menu *API Keys*).
   A assinatura Claude Teams (app claude.ai) não inclui acesso à API.
2. Preencha em `backend/.env`:

```env
ANTHROPIC_API_KEY=sk-ant-...
BOT_MODEL=claude-opus-5-5
BOT_EFFORT=medium
```

**Opção B: assinatura Claude do Grupo via contêiner `chamados-claude` (padrão do FedHub)**

Mesma receita do `fedhub-claude` (FedHub-Backend, ADR-0052): um contêiner com o Claude Code CLI
autenticado com a conta Claude dedicada ao chatbot, exposto só na rede interna do compose.

1. Numa máquina com o Claude Code instalado, entre com a conta do chatbot: `claude login`.
2. Copie `~/.claude/.credentials.json` (no Windows, `%USERPROFILE%\.claude\.credentials.json`)
   para `claude_home/.credentials.json` na raiz deste projeto (pasta git-ignored).
3. `docker compose up --build`. O compose já injeta `CLAUDE_URL=http://chamados-claude:8788` no
   backend. Verifique em *Admin > SuporteBot* se o status mostra "Claude Code (claude.ai / plano team)".

Para desenvolvimento local sem Docker: `node claude/claude_server.js` numa máquina logada com a conta
do bot e `CLAUDE_URL=http://localhost:8788` no `backend/.env`; ou `BOT_PROVIDER=claude_cli` com o
binário `claude` no PATH (opcionalmente `CLAUDE_CONFIG_DIR` apontando para a pasta com o
`.credentials.json` da conta do bot).

**Opção C: reaproveitar o `fedhub-claude` que já roda no host do FedHub (192.168.0.100)**

A API do FedHub não tem rota genérica de prompt (só a análise de PDF usa a Claude por dentro), e o
contêiner `fedhub-claude` só é visível na rede interna do compose do FedHub. Para o SuporteBot usá-lo:

1. No host do FedHub, no `docker-compose.yml`, publique a porta do `fedhub-claude` só na IP da rede
   local e ligue o token (mesmas três linhas de token já usadas no `claude/claude_server.js` deste projeto;
   copie o trecho `TOKEN` de lá para o `src/tools/claude_server.js` do FedHub):

```yaml
  fedhub-claude:
    environment:
      - CLAUDE_SERVER_TOKEN=${CLAUDE_SERVER_TOKEN:-}
    ports:
      - "192.168.0.100:8788:8788"
```

   Adicione `CLAUDE_SERVER_TOKEN=<segredo longo>` no `.env` do FedHub e suba com
   `docker compose up -d fedhub-claude` (o `claude_server.js` vem do volume `./src`, não precisa rebuild).
   Essa porta não passa pelo Caddy/Kong/ngrok; ainda assim, restrinja no firewall do host à IP do
   servidor do chamados.
2. Aqui, no `backend/.env` (ou no `.env` da raiz, para o Docker):

```env
CLAUDE_URL=http://192.168.0.100:8788
CLAUDE_TOKEN=<o mesmo segredo>
```

3. Reinicie o backend e confira *Admin > SuporteBot*. Se o chamados rodar na mesma máquina do FedHub,
   dá para pular a porta: ligue o backend à rede do compose do FedHub e use `http://fedhub-claude:8788`.

Limites das opções B e C: o uso compete com a cota da assinatura (na C, também com a automação de PDF
do FedHub), o token OAuth pode expirar (basta recopiar o arquivo) e cada chamada carrega o prompt fixo
do CLI, então é um pouco mais lenta que a API.

**Como o bot aprende:** em *Admin > SuporteBot* a equipe cadastra artigos (procedimentos, sistemas
internos, políticas). Todo artigo ativo entra no prompt do bot em cada resposta. Técnicos e admins
também podem salvar uma boa resposta direto no chat com o botão **Ensinar**. O bot ainda lembra o
histórico de cada usuário e consulta as respostas públicas da equipe em chamados resolvidos.

### Frontend

```bash
cd frontend
npm install
npx vite --host
```

Frontend: http://localhost:3000

### Docker (produção)

Sobe **PostgreSQL 15 + backend + frontend (nginx)**. O seed inicial é controlado por `SEED_ENABLED`.

```bash
cp .env.example .env
docker compose up -d --build
```

Frontend: http://localhost:3000
Swagger: http://localhost:8000/docs


## Documentação

Consulte [COMO_RODAR.md](COMO_RODAR.md) para instruções detalhadas.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para detalhes.

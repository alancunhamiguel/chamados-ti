# Sistema de Chamados TI - Como Rodar

## Visao Geral

Sistema completo de chamados (helpdesk) para TI com:
- **Backend:** Python 3.11+ / FastAPI / SQLAlchemy async / SQLite (dev) / PostgreSQL (producao)
- **Frontend:** React 18 / TypeScript / TailwindCSS / Vite
- **Auth:** JWT (login local) + Google OAuth (placeholder)
- **Deploy:** Docker Compose

---

## Estrutura do Projeto

```
chamados-system/
├── docker-compose.yml          # Orquestracao dos servicos
├── .env.example                # Variaveis de ambiente (copie para .env)
├── setup.sh                    # Setup automatico (Linux/Mac)
├── COMO_RODAR.md               # Este arquivo
│
├── backend/                    # API Python/FastAPI
│   ├── Dockerfile
│   ├── requirements.txt        # Dependencias (PostgreSQL)
│   ├── requirements-local.txt  # Dependencias (SQLite - dev local)
│   ├── run.py                  # Script de inicializacao
│   ├── alembic.ini             # Config de migrations
│   ├── alembic/                # Migrations do banco
│   ├── app/
│   │   ├── main.py             # App FastAPI (entry point)
│   │   ├── config.py           # Configuracoes (pydantic-settings)
│   │   ├── database.py         # Engine async + Session
│   │   ├── dependencies.py     # Auth JWT + roles
│   │   ├── models/             # SQLAlchemy ORM (6 tabelas)
│   │   ├── schemas/            # Pydantic v2 (request/response)
│   │   ├── api/                # Endpoints REST (20+ rotas)
│   │   ├── services/           # Logica de negocio
│   │   ├── seeds.py            # Dados iniciais
│   │   └── uploads/            # Arquivos anexos
│   └── tests/                  # Testes pytest
│
└── frontend/                   # React/TypeScript
    ├── Dockerfile
    ├── package.json
    ├── nginx.conf              # Reverse proxy (producao)
    └── src/
        ├── App.tsx             # Rotas
        ├── contexts/           # AuthContext (JWT)
        ├── api/                # Axios client (chamadas API)
        ├── pages/              # 6 paginas
        └── components/         # UI components
```

---

## Credenciais de Teste

| Usuario     | Email                    | Senha     | Permissao     |
|-------------|--------------------------|-----------|---------------|
| Admin       | admin@empresa.com        | admin123  | admin         |
| Tecnico 1   | tecnico1@empresa.com     | tech123   | technician    |
| Tecnico 2   | tecnico2@empresa.com     | tech123   | technician    |
| Colaborador | colaborador@empresa.com  | user123   | employee      |

---

## Como Rodar (Desenvolvimento Local)

### Requisitos
- Python 3.11+ (testado com 3.14)
- Node.js 18+ (testado com 24)
- (Opcional) Docker + Docker Compose

### Passo 1: Backend

```bash
# Entrar na pasta do backend
cd chamados-system/backend

# Criar ambiente virtual
python -m venv venv

# Ativar ambiente virtual
# Windows:
venv\Scripts\activate
# Linux/Mac:
source venv/bin/activate

# Instalar dependencias (SQLite para dev local)
pip install -r requirements-local.txt

# Iniciar o servidor
python run.py
```

O backend vai iniciar em: **http://127.0.0.1:8000**

Documentacao Swagger: **http://127.0.0.1:8000/docs**

> O banco SQLite e criado automaticamente na primeira execucao.
> Os dados iniciais (usuarios e setores) sao populados automaticamente.

### Passo 2: Frontend

Em outro terminal:

```bash
# Entrar na pasta do frontend
cd chamados-system/frontend

# Instalar dependencias
npm install

# Iniciar o servidor de desenvolvimento
npx vite --host
```

O frontend vai iniciar em: **http://localhost:3000**

### Passo 3: Testar

1. Acesse **http://localhost:3000**
2. Faca login com `admin@empresa.com` / `admin123`
3. Navegue pelas paginas: Chamados, Novo Chamado, Dashboard, Admin

---

## Como Rodar (Docker - Producao)

### Requisitos
- Docker + Docker Compose instalados

```bash
# Entrar na pasta do projeto
cd chamados-system

# Copiar variaveis de ambiente
cp .env.example .env

# (Opcional) Editar .env com suas configuracoes

# Subir todos os servicos
docker compose up -d

# Verificar status
docker compose ps
```

Servicos:
- Frontend: **http://localhost:3000**
- Backend API: **http://localhost:8000**
- PostgreSQL: **localhost:5432**

Para parar:
```bash
docker compose down
```

Para parar e apagar dados:
```bash
docker compose down -v
```

---

## Variaveis de Ambiente (.env)

```env
# Database (PostgreSQL em producao)
DB_PASSWORD=chamados_secret_2024

# Backend
SECRET_KEY=chave-secreta-jwt-mínimo-32-caracteres
ACCESS_TOKEN_EXPIRE_MINUTES=60
DATABASE_URL=postgresql+asyncpg://chamados_user:${DB_PASSWORD}@postgres:5432/chamados_db

# Google OAuth (opcional)
GOOGLE_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=xxx

# Email (opcional - para notificacoes)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=chamados@empresa.com
SMTP_PASS=senha_app_gmail
EMAIL_FROM=Chamados TI <chamados@empresa.com>

# Frontend
VITE_API_URL=http://localhost:8000/api
```

> Para SQLite (dev local), nao e necessario configurar DATABASE_URL.
> O padrao ja usa SQLite.

---

### SuporteBot (Claude)

| Variavel | Padrao | Descricao |
|---|---|---|
| `BOT_PROVIDER` | `auto` | `api` (chave), `claude_cli` (assinatura via Claude Code) ou `auto` (API se houver chave, senao CLI se houver `CLAUDE_URL`). |
| `ANTHROPIC_API_KEY` | (vazio) | Chave do Console da Anthropic (platform.claude.com) para o provedor `api`. |
| `BOT_MODEL` | `claude-opus-5-5` | Modelo do provedor `api`. |
| `BOT_EFFORT` | `medium` | Profundidade de raciocinio no provedor `api`: `low`, `medium`, `high`, `xhigh`, `max`. |
| `BOT_MAX_HISTORY` | `40` | Quantas mensagens anteriores do usuario vao como contexto. |
| `BOT_FALLBACKS` | `true` | Provedor `api`: se o modelo recusar por politica, a API tenta um modelo alternativo. |
| `CLAUDE_URL` | (vazio) | URL do `claude_server.js` (conteiner `chamados-claude`: `http://chamados-claude:8788`, ja injetado pelo compose). |
| `CLAUDE_TOKEN` | (vazio) | Header `X-Claude-Token` enviado ao `claude_server.js` quando ele exige (`CLAUDE_SERVER_TOKEN`). Obrigatorio ao usar o `fedhub-claude` pela rede. |
| `CLAUDE_BIN` | `claude` | Modo local do CLI (sem `CLAUDE_URL`): binario do Claude Code. |
| `CLAUDE_CONFIG_DIR` | (vazio) | Modo local: pasta com o `.credentials.json` da conta do bot. |
| `BOT_CLI_MODEL` | (vazio) | Modelo no CLI (`sonnet`, `opus`...). Vazio = padrao da assinatura. |
| `BOT_CLI_TIMEOUT` | `120` | Segundos por chamada ao CLI. |

Credenciais do conteiner `chamados-claude`: copie `~/.claude/.credentials.json` de uma sessao `claude login`
feita com a conta do chatbot para `./claude_home/` (git-ignored). Sem esse arquivo o status do bot mostra
"Claude Code sem login".

## Endpoints da API

### Auth
| Metodo | Rota               | Descricao              | Auth |
|--------|---------------------|------------------------|------|
| POST   | /api/auth/login     | Login local            | Nao  |
| POST   | /api/auth/register  | Registrar usuario      | Nao  |
| GET    | /api/auth/me        | Usuario atual          | Sim  |

### Tickets
| Metodo | Rota                          | Descricao              | Auth     |
|--------|-------------------------------|------------------------|----------|
| POST   | /api/tickets                  | Criar chamado          | Sim      |
| GET    | /api/tickets                  | Listar (filtros)       | Sim      |
| GET    | /api/tickets/{id}             | Detalhes               | Sim      |
| PUT    | /api/tickets/{id}             | Atualizar              | Sim      |
| PUT    | /api/tickets/{id}/status      | Mudar status           | Tech/Admin|
| PUT    | /api/tickets/{id}/priority    | Mudar prioridade       | Tech/Admin|
| PUT    | /api/tickets/{id}/assign      | Atribuir tecnico       | Admin    |
| PUT    | /api/tickets/{id}/close       | Fechar chamado         | Sim      |

### Comentarios
| Metodo | Rota                              | Descricao    |
|--------|-----------------------------------|--------------|
| GET    | /api/tickets/{id}/comments        | Listar       |
| POST   | /api/tickets/{id}/comments        | Adicionar    |

### Historico
| Metodo | Rota                              | Descricao    |
|--------|-----------------------------------|--------------|
| GET    | /api/tickets/{id}/history         | Ver historico|

### Dashboard (Admin)
| Metodo | Rota                    | Descricao         |
|--------|-------------------------|-------------------|
| GET    | /api/dashboard/stats    | Metricas gerais   |
| GET    | /api/dashboard/by-status| Por status        |
| GET    | /api/dashboard/by-priority| Por prioridade  |
| GET    | /api/dashboard/by-sector| Por setor         |
| GET    | /api/dashboard/by-technician| Por tecnico    |
| GET    | /api/dashboard/sla-compliance| SLA           |

### Usuarios (Admin)
| Metodo | Rota                    | Descricao         |
|--------|-------------------------|-------------------|
| GET    | /api/users              | Listar todos      |
| GET    | /api/users/{id}         | Buscar por ID     |
| PUT    | /api/users/{id}         | Atualizar         |
| DELETE | /api/users/{id}         | Desativar         |

---

### SuporteBot
| Metodo | Rota | Quem | Descricao |
|---|---|---|---|
| GET | `/api/bot/status` | todos | Se esta configurado, modelo e quantidade de artigos ativos |
| POST | `/api/bot/chat` | todos | Envia mensagem e recebe a resposta (503 sem chave, 502 se a API falhar) |
| GET | `/api/bot/history` | todos | Historico do proprio usuario com o bot |
| DELETE | `/api/bot/history` | todos | Limpa o proprio historico |
| GET/POST | `/api/bot/knowledge` | tecnico/admin | Lista / cria artigos da base de conhecimento |
| PUT/DELETE | `/api/bot/knowledge/{id}` | tecnico/admin | Edita (inclui ativar/desativar) / exclui artigo |

## Regras de Negocio

### Fluxo de Status
```
open -> in_progress -> waiting -> resolved -> closed
                              \-> in_progress (reabrir)
```

### SLA por Prioridade
| Prioridade | Prazo Resolucao |
|------------|-----------------|
| critical   | 4 horas         |
| high       | 8 horas         |
| medium     | 24 horas        |
| low        | 72 horas        |

### Permissoes
| Acao                  | Employee | Technician | Admin |
|-----------------------|----------|------------|-------|
| Criar chamado         | Sim      | Sim        | Sim   |
| Ver proprios          | Sim      | Sim        | Sim   |
| Ver todos             | Nao      | Sim        | Sim   |
| Mudar status          | Nao      | Sim        | Sim   |
| Mudar prioridade      | Nao      | Sim        | Sim   |
| Atribuir tecnico      | Nao      | Nao        | Sim   |
| Gerenciar usuarios    | Nao      | Nao        | Sim   |
| Dashboard/Relatorios  | Nao      | Nao        | Sim   |
| Comentar              | Sim      | Sim        | Sim   |

---

## Integracao no Site Existente

Para integrar o sistema de chamados no site corporativo existente:

### Backend (Python/FastAPI)

1. Copie a pasta `backend/app/` para dentro do projeto existente
2. Adicione as dependencias do `requirements.txt` ao projeto
3. Registre as rotas no FastAPI existente:

```python
from app.api.router import api_router
app.include_router(api_router)
```

4. Configure o banco de dados (SQLite ou PostgreSQL)
5. Rode as migrations com Alembic (ou crie as tabelas diretamente)

### Frontend (React)

1. Copie as pastas `src/api/`, `src/contexts/`, `src/pages/`, `src/components/` para o projeto React existente
2. Instale as dependencias do `package.json`
3. Adicione as rotas no React Router existente
4. Configure a URL da API no `.env`:
   ```
   VITE_API_URL=http://backend-url/api
   ```

### Variaveis de Ambiente

Copie o `.env.example` para `.env` e configure:
- `SECRET_KEY`: Chave secreta para JWT (minimo 32 caracteres)
- `DATABASE_URL`: URL de conexao com o banco
- `SMTP_*`: Configuracoes de email (opcional)
- `GOOGLE_CLIENT_*`: Credenciais Google OAuth (opcional)

---

## Solucao de Problemas

### Erro: "Module not found" no backend
```bash
pip install -r requirements-local.txt
```

### Erro: "Cannot connect to server" no frontend
Verifique se o backend esta rodando em http://127.0.0.1:8000

### Erro: "Token invalido"
O token JWT expirou. Faca login novamente.

### Erro: "Sem permissao"
O usuario nao tem a role necessaria. Verifique o cargo do usuario.

### Banco corrompido (SQLite)
Delete o arquivo `chamados.db` e reinicie o backend. As tabelas serao recriadas.

---

## Tecnologias Utilizadas

### Backend
- Python 3.11+
- FastAPI 0.115+
- SQLAlchemy 2.0+ (async)
- Pydantic v2
- python-jose (JWT)
- passlib + bcrypt (senhas)
- Alembic (migrations)
- uvicorn (servidor)

### Frontend
- React 18
- TypeScript
- Vite
- TailwindCSS
- React Router v6
- Axios
- TanStack Query
- Recharts (graficos)

### Infra
- Docker / Docker Compose
- PostgreSQL 15 (producao)
- SQLite (desenvolvimento)
- Nginx (reverse proxy)

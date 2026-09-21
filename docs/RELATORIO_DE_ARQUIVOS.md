# RELATORIO DE ARQUIVOS — Sistema de Chamados TI

Gerado em set/2026 após auditoria completa + limpeza + verificacao. Este documento explica para que existe cada arquivo do projeto. Nao e documentacao de API; e o mapa do codigo.

## Visao geral da arquitetura

- **backend/**: API REST em FastAPI (Python 3.11+, SQLAlchemy async). Pode rodar com SQLite (dev local) ou PostgreSQL (producao/Docker).
- **frontend/**: SPA em React 18 + TypeScript + Vite + Tailwind. Consome `/api` (proxy dev ou nginx em producao) e WebSockets `/ws/chat`.
- **raiz/**: orquestracao (docker-compose), documentacao e configs compartilhadas.

Fluxo de dados: Frontend -> `src/api/*` (axios) -> nginx (ou proxy dev) -> FastAPI `app/api/*` -> `app/services/*` -> SQLAlchemy `app/models/*` -> DB.

---

## RAIZ DO PROJETO

| Arquivo | Para que existe |
|---|---|
| `docker-compose.yml` | Sobe o stack de producao: `postgres` (15-alpine), `backend` (FastAPI porta 8000) e `frontend` (nginx porta 3000). O backend le o `.env` da raiz. Persiste uploads em volume e o Postgres em `pgdata`. |
| `.env.example` | Modelo de todas as variaveis usadas pelo sistema (DB, JWT, CORS, Google OAuth, SMTP, frontend). Na raiz servem ao docker-compose; os mesmos valores precisam existir em `backend/.env` e `frontend/.env` para o modo local. |
| `.gitignore` | Mantem fora do git segredos (`.env`), venv, `node_modules`, DBs (`*.db`), logs e artefatos (logo/favicon sao branding interno). |
| `README.md` | Visao geral do projeto para quem chega. |
| `COMO_RODAR.md` | Instrucoes de execucao local passo a passo (backend/frontend/tests). |
| `setup.sh` | Script de instalacao/primeira execucao em ambientes Unix (roda a parte de Python + Node). |
| `LICENSE` | Licenca do projeto. |

---

## BACKEND (`backend/`)

### Entrada e processo
| Arquivo | Para que existe |
|---|---|
| `app/main.py` | Bootstrap do app: cria a `FastAPI`, registra CORS, inclui o router `/api`, inclui as WebSockets, define o `/health` e, no lifespan (`startup`), roda `init_db()` (cria tabelas) e `seed_data()` (setores + usuarios iniciais, idempotente — nunca duplica). Tambem permite `python app/main.py` (serve com reload). |
| `run.py` | Entry point alternativo: `uvicorn app.main:app --host 127.0.0.1 --port 8000`. **Redundante.** O jeito documentado e o comando `uvicorn app.main:app` do CLI (com `--reload` em dev). Mantido por conveniencia de quem quiser `python backend/run.py`. |
| `Dockerfile` | Imagem de producao: Python 3.11-slim, instala `requirements.txt`, expoe 8000 e roda `uvicorn app.main:app` em 0.0.0.0. |
| `requirements.txt` | **Dependencias de runtime (producao/Docker).** PostgreSQL via `asyncpg`. NUNCA instalar `requirements-local.txt` em cima deste sem unificar. Nao contem ferramentas de dev/teste. |
| `requirements-local.txt` | **Dependencias de dev local + testes.** Usa `aiosqlite` em vez de `asyncpg` (que exige compilador no Windows). Inclui `pytest`/`pytest-asyncio`. `python-dotenv` e dependencia implicita do `pydantic-settings` (sem ela o `.env` nao e lido) — por isso aparece nos dois arquivos. |
| `chamados.db` | Banco SQLite local (dev). Ignorado pelo git (`*.db`). Em producao a fonte de verdade e o Postgres. |
| `logs/` | Diretorio de log. `emails.log` registra os e-mails "enviados" quando o SMTP nao esta configurado (modo dev) e os erros de envio real. |

### `app/config.py`
| O que faz | Le o `.env` (backend/.env ou raiz/.env) via `pydantic-settings` com cache (`@lru_cache`). Define: `DATABASE_URL` (padrao SQLite local), JWT (`SECRET_KEY`, tempos de expiracao), SMTP, `CORS_ORIGINS`, Google OAuth (`GOOGLE_CLIENT_ID/SECRET/ALLOWED_DOMAIN`) e limites de upload. **Atencao:** por causa do cache, alteracoes no `.env` exigem reiniciar o backend. |

### `app/database.py`
| O que faz | Cria a engine async (com `check_same_thread` para SQLite), a fabrica de sessoes `async_session`, a base `Base` dos modelos ORM, o `init_db()` (cria as tabelas) e a dependencia `get_db()` (gera sessao por request, commit/rollback automatico). |

### `app/dependencies.py`
| O que faz | Centraliza autenticacao/autorizacao: `get_current_user` (valida o JWT Bearer e carrega o usuario), `require_role(...)` que gera `require_admin` e `require_technician_or_admin`, e `ensure_ticket_access(user, ticket)` que aplica a regra de RBAC mais importante: **colaborador so enxerga chamados criados por ele mesmo; staff enxerga tudo**. |

### `app/models/` (ORM - espelha o banco)
| Arquivo | Para que existe |
|---|---|
| `enums.py` | Enums compartilhados: `UserRole`, `TicketStatus`, `TicketPriority`, `OnlineStatus`. Padrao de um lugar so para nao repetir string magica. |
| `user.py` | Tabela `users`: dados de login (email, senha hashada — `NULL` para quem entrou via Google), setor, papel, status online, avatar, ativo. |
| `ticket.py` | Tabela `tickets`: numero (sequencial), titulo, descricao, status, prioridade, setor, categoria, SLA (`sla_deadline`), `resolved_at`/`closed_at` e relacoes com criador/atendente/setor/comentarios/chat/anexos/historico. |
| `comment.py` | Tres tabelas: `ticket_comments` (comentarios publicos/internos), `ticket_attachments` (anexos com nome original + nome em disco) e `ticket_history` (linha do tempo de tudo que acontece no chamado). |
| `chat.py` | Tabela `ticket_chat`: mensagens do chat em tempo real por chamado (inclui `is_system` para avisos automaticos). |
| `__init__.py` | Importa os modelos para o `Base.metadata` enxerga-los (necessario para `create_all`). |

### `app/schemas/` (contratos Pydantic de entrada/saida)
| Arquivo | Para que existe |
|---|---|
| `user.py` | `UserCreate`, `UserUpdate`, `UserLogin`, `UserResponse`, `TokenResponse` (payload de login/refresh com access+refresh token e dados do usuario). |
| `ticket.py` | `TicketCreate/Update/StatusUpdate/PriorityUpdate/Assign`, `TicketResponse` (serializa o chamado + criador/atendente/setor), `TicketListResponse` (pagina de lista), `SectorResponse`, `AttachmentResponse`. |
| `comment.py` | `CommentCreate/Response`, `HistoryResponse` (aba de historico) e `DashboardStats` (agregado de KPIs). |
| `chat.py` | `ChatMessageCreate/Response` (mensagens do chat via REST). |
| `__init__.py` | Vazio — namespace. |

### `app/api/` (camada HTTP)
| Arquivo | Para que existe |
|---|---|
| `router.py` | Monta o router raiz `/api` e registra todos os sub-routers com prefixos (`/auth`, `/users`, `/tickets`, `/sectors`, `/dashboard`). |
| `auth.py` | Cadastro/login por senha, **login Google** (`POST /google`: valida id_token, checa domínio corporativo, cria/atualiza usuario e emite tokens), `POST /refresh` (renova o par de tokens), `GET /me` e `PUT /me/status` (status online). Retorna **503** se o Google nao estiver configurado. |
| `users.py` | CRUD de usuarios (admin), lista de tecnicos disponiveis (staff) e status do time (logado). |
| `tickets.py` | CRUD de chamados com RBAC: cria (logado), lista (colaborador ve so os seus), detalhe, `PUT /status` (maquina de estados por papel), `PUT /priority`, `PUT /assign`, e `/unread` (contador de chat nao lido). |
| `comments.py` | Listar/`POST` comentarios (publicos e internos para staff; colaborador ve so publicos e do seu chamado). Dispara notificacao por e-mail em comentarios publicos. |
| `history.py` | `GET /history` — linha do tempo do chamado, respeitando acesso. |
| `attachments.py` | Lista, upload (valida extensao, MIME real e tamanho maximo), download (serve o arquivo) e delete. Nome em disco e UUID; nome original virou XSS-safe. |
| `chat.py` | REST de chat: historico e envio de mensagem por chamado (o tempo real vem do WS). |
| `ws_chat.py` | **WebSocket** `/ws/chat/{ticket_id}`: autentica via `?token=` (JWT), valida acesso ao chamado, mantem conexoes ativas por chamado, recebe mensagens, grava no banco e faz broadcast para todos conectados. Fechamento com codigos de erro (4001 token invalido, 4003 sem acesso, etc.). |
| `dashboard.py` | Endpoints de KPIs (staff): `GET /dashboard/stats`, `by-status`, `by-priority`, `by-sector`, `by-technician`, `by-sla-compliance`. |
| `sectors.py` | Lista setores ativos (**agora exige login** — foi corrigido), lista completa (admin), CRUD de setores (admin) com desativacao logica. |
| `__init__.py` | Vazio — namespace. |

### `app/services/` (logica de negocio)
| Arquivo | Para que existe |
|---|---|
| `auth_service.py` | JWT (create/decode access+refresh), hash/verificacao de senha (bcrypt via passlib), `verify_google_token` (chama `https://oauth2.googleapis.com/tokeninfo` com httpx e valida `aud`, `email`, `email_verified`, `hd`/dominio), login por senha e busca de usuario por id. |
| `ticket_service.py` | O coracao das regras do chamado: SLA por prioridade (critical 4h / high 8h / medium 24h / low 72h), **maquina de estados com permissoes** (`can_transition`: STAFF_TRANSITIONS x CREATOR_TRANSITIONS — o criador confirma solucao fechando ou devolvendo `resolved->in_progress`), listagem com filtros/paginacao/RBAC, mudanca de status/prioridade/atribuicao e registro de cada acao no historico. |
| `chat_service.py` | Persistencia de mensagens do chat, exclusao em cascata e calculo de notificacoes nao lidas por usuario. |
| `dashboard_service.py` | Agregacoes SQL para os KPIs. **Inclui o calculo correto do "tempo medio de resolucao em horas" feito em Python** (o SQL nao subtrai datetime corretamente — antes retornava numeros absurdos como -58M horas). |
| `email_service.py` | Notificacoes por e-mail (best-effort, nunca quebra a request): avisa `criador` em criacao/status/prioridade/edicao, `staff` em criacao, `atendente` em atribuicao, `criador+atendente` em comentario publico (comentario interno nunca e enviado). Templates HTML com `html.escape` (anti-XSS). Sem SMTP configurado, grava em `logs/emails.log`; falha real e logada como "FALHA NO ENVIO SMTP". |

### `app/utils/__init__.py`
Vazio — namespace reservado (nao ha helpers no momento).

### `tests/`
| Arquivo | Para que existe |
|---|---|
| `conftest.py` | Isolamento dos testes: **desativa SMTP** via env (`SMTP_USER/PASS=""`) antes de importar o app, troca o `get_db` por um banco SQLite de teste (`test.db`), cria/dropas tabelas a cada teste e fornece 3 usuarios (admin/tech/employee) + tokens. |
| `test_auth.py` | 10 testes: register/login, login invalido, `/me`, refresh e o fluxo Google (cria employee com `password_hash=None`, **503 quando nao configurado** — corrigido para ser hermetico com `patch`, bloqueio de dominio fora da empresa e reuso de usuario existente). |
| `test_tickets.py` | 11 testes: criacao, listagem com RBAC (colaborador nao ve chamado alheio; staff ve), detalhe, transicoes de status `/resolved->closed`, `/closed->in_progress` reabre, `/resolved->in_progress` devolver, regra de SLA (chamado vencido aparece como breach) e **tempo medio de resolucao** (backdate de 2h -> ~2.0h). |

---

## FRONTEND (`frontend/`)

### Config e infra
| Arquivo | Para que existe |
|---|---|
| `index.html` | Pagina host da SPA; carrega o script do **Google Identity Services** (gstatic) para o botao "Entrar com Google". |
| `package.json` | Manifesto Node: scripts (`dev`, `build` = tsc + vite, `lint`, `typecheck`) e dependencias (react, react-dom, react-router-dom, @tanstack/react-query, axios, recharts + eslint/tailwind/vite/typescript). |
| `vite.config.ts` | Config do Vite: plugin React, base (via env `VITE_BASE_PATH` — hoje sempre usa `/`), porta dev 3000 e proxy de dev `/api` e `/ws` para `http://localhost:8000` (habilita WS). |
| `tsconfig.json` | Config do TypeScript (strict mode). |
| `tailwind.config.js` | Tema visual: paleta `primary`/`brand`/`surface`, raios de card e sombras. Nada de plugins. |
| `postcss.config.js` | Ponte Tailwind -> PostCSS. |
| `.env` | Variaveis dev do Vite: `VITE_API_URL` e `VITE_GOOGLE_CLIENT_ID` (se vazio, o botao Google some da tela de login). |
| `Dockerfile` | Build em 2 estagios: compila a SPA com Node 20 e serve via nginx. |
| `nginx.conf` | SPA em static + roteamento: `try_files` para o router do React e proxy reverso de `/api` para o servico `backend:8000`. |

### Bootstrap
| Arquivo | Para que existe |
|---|---|
| `src/main.tsx` | Monta o React (StrictMode) no `#root` e importa o CSS global. |
| `src/App.tsx` | Providers (React Query, Auth, Toast, Chat), router (`/login`, rotas privadas `/tickets`, `/dashboard` staff-only, `/admin` admin-only) e guardas `PrivateRoute`/`StaffRoute`/`AdminRoute`. |
| `src/index.css` | Tokens do Tailwind + estilos globais. |
| `src/vite-env.d.ts` | Tipagem de `import.meta.env` (vars do Vite). |
| `src/types/index.ts` | Tipos compartilhados: `User`, `Ticket`, `TicketStatus/Priority`, `Sector`. (Exports mortos removidos na limpeza.) |

### `src/api/` (camada HTTP - axios)
| Arquivo | Para que existe |
|---|---|
| `client.ts` | Instancia axios com baseURL, interceptador de request (injeta Bearer do localStorage) e interceptador de response que **faz refresh automatico** de token 401 (fila de requests travadas, single-flight) e forca logout/redirect se o refresh falhar. |
| `auth.ts` | Login por senha, login Google, register, `GET /me`, status online. |
| `tickets.ts` | `getTickets` (params), `getTicket`, `createTicket` (multipart com anexos), status, prioridade, atribuicao. |
| `comments.ts` | `getComments`, `addComment` (publico/interno). |
| `attachments.ts` | Listar, subir, baixar e deletar anexos. |
| `dashboard.ts` | `getDashboardStats`, `getByStatus/Priority/Sector/Technician`, `getSlaCompliance`. |
| `sectors.ts` | `getSectors` — lista setores ativos para o formulario de novo chamado e filtros. |
| `users.ts` | Lista usuarios (admin), tecnicos (staff) e status do time. |

### `src/contexts/`
| Arquivo | Para que existe |
|---|---|
| `AuthContext.tsx` | Estado de sessao: usuario/token em localStorage, boot com `/me`, `login`, `loginWithGoogle`, `logout`, `updateUser`, status online e o helper `hasRole` (base de toda a UI por papel). |
| `ChatContext.tsx` | Guarda na memoria as abas de chat abertas (max. 3), sinalizador `hasNewMessages` e acoes de abrir/fechar. |
| `ToastContext.tsx` | Sistema de toasts (success/error/warning/info) exibidos no canto superior direito, auto-dismiss de 5s. |

### `src/components/`
| Arquivo | Para que existe |
|---|---|
| `Layout/Layout.tsx` | Shell da aplicacao logada: Sidebar + Header + `<Outlet/>`. |
| `Layout/Sidebar.tsx` | Navegacao por papel: todos veem Chamados; staff ve Dashboard; admin ve Admin (gerenciar usuarios/setores). Desativa itens sem permissao. |
| `Layout/Header.tsx` | Barra de topo: logo/branding, badge de status online do usuario e menu de logout. |
| `Chat/ChatPopup.tsx` | Janelas flutuantes de chat por chamado: conecta no WebSocket `/ws/chat`, envia/recebe mensagens em tempo real e mostra as nao lidas. |
| `Chat/ChatNotificationPoller.tsx` | Polling de seguranca (REST `/tickets/unread`) que ativa o badge de "novas mensagens" mesmo sem WS aberto. |

### `src/pages/`
| Arquivo | Para que existe |
|---|---|
| `Login.tsx` | Tela de login: e-mail/senha **e botao "Entrar com Google"** (rendered pelo GSI, sume se `VITE_GOOGLE_CLIENT_ID` vazio). |
| `Dashboard.tsx` | KPIs (totais, tempo medio de resolucao, SLA) + graficos (recharts) por status/prioridade/setor/tecnico. Staff-only. |
| `TicketListPage.tsx` | Lista paginada com busca, filtros de status/prioridade, badges de SLA e prioridade, e secao separada de "Chamados Fechados". Atualiza a cada 10s. (O suposto link falso "ver mais" nao existe neste codigo — auditoria apontou, verificacao descartou.) |
| `NewTicket.tsx` | Formulario de abertura: titulo, descricao, setor (do `/sectors`), categoria, prioridade e upload de anexos. |
| `TicketDetailPage.tsx` | Detalhe completo: dados, mudanca de status/prioridade (por papel), atribuicao (staff), aba de comentarios publicos+internos, anexos (upload/download/delete), historico e botao de abrir chat. |

---

## O QUE FOI CORRIGIDO NA LIMPEZA (set/2026)

1. **Seguranca:** `GET /api/sectors` agora exige login (antes era publico).
2. **Hermeticidade de teste:** `test_google_login_not_configured` agora faz `patch` do `GOOGLE_CLIENT_ID=""`; antes dependia do `.env` (quebrava quando o .env real estava configurado).
3. **`requirements.txt` / `requirements-local.txt`:** removidas deps nao usadas (`alembic`, `aiofiles`, `jinja2`, `google-auth`, `ruff`, `mypy`). Mantido `python-dotenv` (dependencia implicita do pydantic-settings). Testes: 21/21 verdes.
4. **Frontend types:** removidos exports mortos (`Comment`, `Attachment`, `HistoryEntry`, `DashboardStats`, `TicketListResponse`). `tsc --noEmit` e `npm run build` limpos.
5. **`.env.example`:** adicionados `GOOGLE_ALLOWED_DOMAIN`, origin `127.0.0.1:3000` no CORS e nota dos vars do frontend (`VITE_*`).
6. **`.gitignore`:** removido bloco orfao do Alembic (ja removido do projeto).
7. **Artefatos:** removidos `backend/test.db`, `backend/server.log`, `frontend/vite.log` (lixo de execucao).
8. **Logo (`repo publico`):** as logos reais foram movidas para `frontend/brand/` (gitignored); no `public/` ficam placeholders neutros versionados para nao quebrar a imagem.
9. **Docker + PostgreSQL:** adicionado proxy de `/ws` no `nginx.conf` (chat em producao); criada a raiz `.env` (gitignored) com `DATABASE_URL` para o postgres do compose; seed agora pode ser desligado via `SEED_ENABLED=false` (padrao `true`). Stack validado com `docker compose up --build` (postgres healthy, login e seed OK).

## MELHORIAS FUTURAS (fora de escopo deliberadamente)

- `backend/run.py` e redundante com o CLI `uvicorn app.main:app`; pode ser removido.
- `vite.config.ts` usa `process.env.VITE_BASE_PATH` que nunca e preenchido (Vite nao expoe `.env` nesse contexto); trocar por `loadEnv` ou remover.
- `frontend/src/api/client.ts`: `failedQueue` usa `any` e a baseURL e repetida; ajustar tipos/constante. Tratamento de 403 do refresh e implicito (logout).
- Chat: WS + poller convivem (dedupe ja por id); avaliar reduzir o polling.
- Migrar `Settings`/schemas Pydantic para `ConfigDict` (o class-based `Config` e deprecated).
- Wire de producao: rotacionar `GOOGLE_CLIENT_SECRET` (esteve exposto em chat) e registrar os JavaScript origins `http://localhost:3000`/`http://127.0.0.1:3000` no Google Cloud Console para o login Google em navegador.
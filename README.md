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

## Credenciais de Teste

| Usuario     | Email                    | Senha     | Role        |
|-------------|--------------------------|-----------|-------------|
| Admin       | admin@empresa.com        | admin123  | admin       |
| Tecnico 1   | tecnico1@empresa.com     | tech123   | technician  |
| Colaborador | colaborador@empresa.com  | user123   | employee    |

## Documentação

Consulte [COMO_RODAR.md](COMO_RODAR.md) para instruções detalhadas.

## Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para detalhes.

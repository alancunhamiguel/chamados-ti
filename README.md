# Sistema de Chamados TI

Sistema web completo para gestão de chamados de TI (helpdesk) permitindo que colaboradores abram chamados e que a equipe tecnica gerencie, priorize e resolva-os.

## Funcionalidades

- **Criacao de chamados** com titulo, descricao, setor, categoria, prioridade e anexos
- **Painel admin** com dashboard, graficos e metricas
- **Fluxo de status** controlado (open -> in_progress -> waiting -> resolved -> closed)
- **SLA automatico** por prioridade (critica 4h, alta 8h, media 24h, baixa 72h)
- **Comentarios** publicos e internos (só tecnicos veem internos)
- **Upload de anexos** (imagens, PDFs, documentos) na criacao e no detalhe do chamado
- **Historico completo** de todas as acoes
- **Notificacoes por email** (templates prontos)
- **Autenticacao JWT** (roles employee, technician, admin)
- **Permissoes por role** (employee, technician, admin)

## Stack Tecnica

| Camada    | Tecnologia                                    |
|-----------|-----------------------------------------------|
| Backend   | Python 3.11+ / FastAPI / SQLAlchemy async     |
| Banco     | PostgreSQL 15 (producao) / SQLite (dev)       |
| Frontend  | React 18 / TypeScript / TailwindCSS / Vite    |
| Auth      | JWT                                         |
| Deploy    | Docker / Docker Compose                       |

## Inicio Rapido

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

### Configuracao de E-mail

Sem SMTP configurado o sistema **nao envia** e-mails: grava todos em
`backend/logs/emails.log` (modo dev/fallback). Para enviar de verdade,
edite `backend\.env` e preencha as credenciais:

```env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=seu.email@gmail.com
SMTP_PASS=sua-senha-de-app-do-gmail
EMAIL_FROM=Chamados TI <seu.email@gmail.com>
```

Notificacoes enviadas: novo chamado (ao criador + equipe TI), atribuicao,
mudanca de status (solucao/encerramento) e novos comentarios publicos.

### Frontend

```bash
cd frontend
npm install
npx vite --host
```

Frontend: http://localhost:3000

### Docker (producao)

```bash
cp .env.example .env
docker compose up -d
```

## Credenciais de Teste

| Usuario     | Email                    | Senha     | Role        |
|-------------|--------------------------|-----------|-------------|
| Admin       | admin@empresa.com        | admin123  | admin       |
| Tecnico 1   | tecnico1@empresa.com     | tech123   | technician  |
| Colaborador | colaborador@empresa.com  | user123   | employee    |

## Documentacao

Consulte [COMO_RODAR.md](COMO_RODAR.md) para instrucoes detalhadas.

## Licenca

Distribuido sob a licenca MIT. Veja [LICENSE](LICENSE) para detalhes.

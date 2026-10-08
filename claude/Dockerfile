# Contêiner `chamados-claude`: Claude Code CLI (Anthropic) autenticado com a conta
# Claude dedicada ao chatbot, exposto ao backend do Sistema de Chamados como
# micro-serviço HTTP interno (claude/claude_server.js). Mesma receita do
# `fedhub-claude` (FedHub-Backend/Dockerfile.claude, ADR-0052).
#
# Credenciais (claudeAiOauth) ficam no volume ./claude_home (git-ignored), fora da
# imagem — copiadas uma vez de uma sessão `claude` autenticada com a conta do bot
# (`~/.claude/.credentials.json`). Sem API key: o uso é debitado da assinatura.
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates curl git \
    && rm -rf /var/lib/apt/lists/*

# versão fixada = a mesma validada no fedhub-claude
RUN npm install -g @anthropic-ai/claude-code@2.1.263 && npm cache clean --force

WORKDIR /app
COPY claude_server.js /app/claude_server.js

ENV CLAUDE_CONFIG_DIR=/root/.claude-home \
    CLAUDE_SERVER_PORT=8788

EXPOSE 8788
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:8788/status',r=>process.exit(r.statusCode===200?0:1)).on('error',()=>process.exit(1))"

CMD ["node", "/app/claude_server.js"]

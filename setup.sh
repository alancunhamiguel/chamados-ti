#!/bin/bash

# Script de setup do Sistema de Chamados TI

echo "=== Sistema de Chamados TI - Setup ==="

# Copiar .env
if [ ! -f .env ]; then
    cp .env.example .env
    echo "Arquivo .env criado"
fi

# Gerar SECRET_KEY aleatorio
SECRET_KEY=$(openssl rand -hex 32)
sed -i "s/SECRET_KEY=.*/SECRET_KEY=$SECRET_KEY/" .env

echo "Iniciando containers..."
docker compose up -d postgres

echo "Aguardando PostgreSQL..."
sleep 5

echo "Rodando migrations..."
docker compose run --rm backend alembic upgrade head

echo "Populando dados iniciais..."
docker compose run --rm backend python -m app.seeds

echo "Iniciando todos os servicos..."
docker compose up -d

echo ""
echo "=== Setup concluido! ==="
echo "Frontend: http://localhost:3000"
echo "Backend API: http://localhost:8000/docs"
echo ""
echo "Credenciais de teste:"
echo "  Admin:      admin@empresa.com / admin123"
echo "  Tecnico:    tecnico1@empresa.com / tech123"
echo "  Colaborador: colaborador@empresa.com / user123"

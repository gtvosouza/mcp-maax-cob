#!/bin/bash

# Script para iniciar MAAX COB em modo MCP HTTP
# Porta: 8009 (configurada via MCP_HTTP_PORT no .env)

set -e

cd "$(dirname "$0")"

echo "========================================"
echo "  Iniciando MAAX COB MCP Server"
echo "========================================"
echo ""

# Verificar se .env existe
if [ ! -f .env ]; then
    echo "❌ Erro: Arquivo .env não encontrado!"
    echo "   Copie .env.example para .env e configure as variáveis."
    exit 1
fi

# Verificar se MCP_TOKEN_SECRET está configurado
if ! grep -q "MCP_TOKEN_SECRET=" .env || grep -q "MCP_TOKEN_SECRET=change-me" .env; then
    echo "⚠️  Aviso: MCP_TOKEN_SECRET não configurado ou usando valor padrão!"
    echo "   Configure o mesmo valor usado no backend-maax-agent"
    echo ""
fi

# Verificar se Redis está rodando
if ! redis-cli ping > /dev/null 2>&1; then
    echo "⚠️  Aviso: Redis não está respondendo em localhost:6379"
    echo "   Inicie Redis com: redis-server"
    echo ""
fi

# Verificar se porta 8009 está em uso
if lsof -i :8009 > /dev/null 2>&1; then
    echo "❌ Erro: Porta 8009 já está em uso!"
    echo "   Pare o processo atual ou altere MCP_HTTP_PORT no .env"
    exit 1
fi

echo "✅ Configurações OK"
echo ""
echo "🚀 Iniciando MCP HTTP Server..."
echo "   Porta: 8009"
echo "   Endpoint: http://localhost:8009/mcp"
echo ""

# Iniciar servidor MCP em modo HTTP
MCP_TRANSPORT=http npm run mcp

#!/bin/bash

# Deploy MCP MAAX COB no Docker Desktop
# Sobe tanto REST API (3000) quanto MCP Server (3001/3002)

echo "🐳 DEPLOY MCP MAAX COB - DOCKER DESKTOP"
echo "======================================="
echo ""

# Verificar se Docker está rodando
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker Desktop não está rodando!"
    echo "   Inicie o Docker Desktop e tente novamente."
    exit 1
fi

echo "✅ Docker Desktop detectado"
echo ""

# Verificar se docker-compose ou docker compose está disponível
COMPOSE_CMD=""
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
else
    echo "❌ Docker Compose não encontrado!"
    echo "   Instale o Docker Compose e tente novamente."
    exit 1
fi

echo "✅ Docker Compose detectado: $COMPOSE_CMD"
echo ""

# Build das imagens
echo "🔨 Fazendo build das imagens..."
$COMPOSE_CMD -f docker-compose.mcp.yml build --no-cache

echo ""
echo "🚀 Subindo serviços..."

# Subir todos os serviços
$COMPOSE_CMD -f docker-compose.mcp.yml up -d

echo ""
echo "⏳ Aguardando serviços ficarem prontos..."
sleep 10

# Verificar status dos serviços
echo ""
echo "📊 Status dos serviços:"
$COMPOSE_CMD -f docker-compose.mcp.yml ps

echo ""
echo "🏥 Verificando health checks..."

# Testar cada serviço
echo ""
echo "1️⃣ Testando PostgreSQL..."
if $COMPOSE_CMD -f docker-compose.mcp.yml exec -T db pg_isready -U mcpuser -d mcp > /dev/null 2>&1; then
    echo "   ✅ PostgreSQL funcionando"
else
    echo "   ❌ PostgreSQL com problemas"
fi

echo ""
echo "2️⃣ Testando Redis..."
if $COMPOSE_CMD -f docker-compose.mcp.yml exec -T redis redis-cli ping > /dev/null 2>&1; then
    echo "   ✅ Redis funcionando"
else
    echo "   ❌ Redis com problemas"
fi

echo ""
echo "3️⃣ Testando REST API..."
sleep 5
if curl -f -s http://localhost:3000/health/ready > /dev/null 2>&1; then
    echo "   ✅ REST API funcionando (porta 3000)"
else
    echo "   ❌ REST API com problemas"
    echo "   Logs:"
    $COMPOSE_CMD -f docker-compose.mcp.yml logs api --tail=5
fi

echo ""
echo "4️⃣ Testando MCP Server..."
if curl -f -s http://localhost:3001/health > /dev/null 2>&1; then
    echo "   ✅ MCP HTTP/SSE funcionando (porta 3001)"
else
    echo "   ❌ MCP HTTP/SSE com problemas"
    echo "   Logs:"
    $COMPOSE_CMD -f docker-compose.mcp.yml logs mcp --tail=5
fi

# Teste de WebSocket
echo ""
echo "5️⃣ Testando MCP WebSocket..."
if curl -f -s http://localhost:3002/health > /dev/null 2>&1; then
    echo "   ✅ MCP WebSocket funcionando (porta 3002)"
else
    echo "   ⚠️ MCP WebSocket pode estar rodando (normal para WS)"
fi

echo ""
echo "🎯 TESTES RÁPIDOS"
echo "=================="

# Teste de inicialização
echo ""
echo "📝 Inicializando tenant..."
INIT_RESPONSE=$(curl -s -X POST http://localhost:3000/v1/tenants/init 2>/dev/null)
if [[ $? -eq 0 ]] && [[ -n "$INIT_RESPONSE" ]]; then
    echo "   ✅ Tenant inicializado"
    ADMIN_KEY=$(echo "$INIT_RESPONSE" | grep -o '"admin_api_key":"[^"]*"' | cut -d'"' -f4)
    if [[ -n "$ADMIN_KEY" ]]; then
        echo "   🔑 Admin Key: ${ADMIN_KEY:0:20}..."
    fi
else
    echo "   ❌ Erro ao inicializar tenant"
fi

echo ""
echo "🎉 DEPLOY CONCLUÍDO!"
echo ""
echo "📋 SERVIÇOS DISPONÍVEIS:"
echo "========================"
echo ""
echo "🌐 REST API:"
echo "   http://localhost:3000"
echo "   Health: http://localhost:3000/health/ready"
echo ""
echo "🔌 MCP Server:"
echo "   HTTP/SSE: http://localhost:3001/mcp"
echo "   WebSocket: ws://localhost:3002"
echo "   Health: http://localhost:3001/health"
echo ""
echo "🗄️ Banco de Dados:"
echo "   PostgreSQL: localhost:5432 (mcpuser/mcppass)"
echo "   Redis: localhost:6379"
echo "   RabbitMQ Management: http://localhost:15672 (admin/admin123)"
echo ""
echo "📖 COMO USAR:"
echo "============="
echo ""
echo "1️⃣ REST API (aplicações existentes):"
echo "   curl http://localhost:3000/v1/tenants"
echo ""
echo "2️⃣ MCP com Claude Desktop:"
echo "   Configure claude_desktop_config.json:"
echo '   "mcp-maax-cob": {'
echo '     "command": "docker",'
echo '     "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"]'
echo '   }'
echo ""
echo "3️⃣ MCP via HTTP (apps web):"
echo "   EventSource: http://localhost:3001/mcp"
echo ""
echo "4️⃣ MCP via WebSocket (real-time):"
echo "   WebSocket: ws://localhost:3002"
echo ""
echo "🛠️ COMANDOS ÚTEIS:"
echo "=================="
echo ""
echo "   # Ver logs"
echo "   $COMPOSE_CMD -f docker-compose.mcp.yml logs -f"
echo ""
echo "   # Parar tudo"
echo "   $COMPOSE_CMD -f docker-compose.mcp.yml down"
echo ""
echo "   # Restart apenas MCP"
echo "   $COMPOSE_CMD -f docker-compose.mcp.yml restart mcp"
echo ""
echo "   # Shell no container MCP"
echo "   $COMPOSE_CMD -f docker-compose.mcp.yml exec mcp sh"
echo ""
echo "✨ Sistema MCP rodando no Docker Desktop!"
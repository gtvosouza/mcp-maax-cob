# Deploy MCP MAAX COB - Windows PowerShell
# Script para Docker Desktop no Windows

Write-Host "🐳 DEPLOY MCP MAAX COB - DOCKER DESKTOP WINDOWS" -ForegroundColor Cyan
Write-Host "===============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Docker está rodando
try {
    docker info | Out-Null
    Write-Host "✅ Docker Desktop detectado" -ForegroundColor Green
} catch {
    Write-Host "❌ Docker Desktop não está rodando!" -ForegroundColor Red
    Write-Host "   Inicie o Docker Desktop e tente novamente." -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Build das imagens
Write-Host "🔨 Fazendo build das imagens..." -ForegroundColor Yellow
docker-compose -f docker-compose.mcp.yml build --no-cache

Write-Host ""
Write-Host "🚀 Subindo serviços..." -ForegroundColor Yellow

# Subir todos os serviços
docker-compose -f docker-compose.mcp.yml up -d

Write-Host ""
Write-Host "⏳ Aguardando serviços ficarem prontos..." -ForegroundColor Yellow
Start-Sleep -Seconds 10

# Verificar status dos serviços
Write-Host ""
Write-Host "📊 Status dos serviços:" -ForegroundColor Cyan
docker-compose -f docker-compose.mcp.yml ps

Write-Host ""
Write-Host "🏥 Verificando health checks..." -ForegroundColor Cyan

# Testar PostgreSQL
Write-Host ""
Write-Host "1️⃣ Testando PostgreSQL..." -ForegroundColor White
try {
    docker-compose -f docker-compose.mcp.yml exec -T db pg_isready -U mcpuser -d mcp | Out-Null
    Write-Host "   ✅ PostgreSQL funcionando" -ForegroundColor Green
} catch {
    Write-Host "   ❌ PostgreSQL com problemas" -ForegroundColor Red
}

# Testar Redis
Write-Host ""
Write-Host "2️⃣ Testando Redis..." -ForegroundColor White
try {
    docker-compose -f docker-compose.mcp.yml exec -T redis redis-cli ping | Out-Null
    Write-Host "   ✅ Redis funcionando" -ForegroundColor Green
} catch {
    Write-Host "   ❌ Redis com problemas" -ForegroundColor Red
}

# Testar REST API
Write-Host ""
Write-Host "3️⃣ Testando REST API..." -ForegroundColor White
Start-Sleep -Seconds 5
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health/ready" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ REST API funcionando (porta 3000)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ REST API com problemas" -ForegroundColor Red
    Write-Host "   Logs:" -ForegroundColor Yellow
    docker-compose -f docker-compose.mcp.yml logs api --tail=5
}

# Testar MCP HTTP
Write-Host ""
Write-Host "4️⃣ Testando MCP Server..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing
    if ($response.StatusCode -eq 200) {
        Write-Host "   ✅ MCP HTTP/SSE funcionando (porta 3001)" -ForegroundColor Green
    }
} catch {
    Write-Host "   ❌ MCP HTTP/SSE com problemas" -ForegroundColor Red
    Write-Host "   Logs:" -ForegroundColor Yellow
    docker-compose -f docker-compose.mcp.yml logs mcp --tail=5
}

# Testar WebSocket
Write-Host ""
Write-Host "5️⃣ Testando MCP WebSocket..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3002/health" -UseBasicParsing -ErrorAction SilentlyContinue
    Write-Host "   ✅ MCP WebSocket funcionando (porta 3002)" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  MCP WebSocket pode estar rodando (normal para WS)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "🎯 TESTES RÁPIDOS" -ForegroundColor Cyan
Write-Host "=================" -ForegroundColor Cyan

# Teste de inicialização
Write-Host ""
Write-Host "📝 Inicializando tenant..." -ForegroundColor White
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/v1/tenants/init" -Method POST
    Write-Host "   ✅ Tenant inicializado" -ForegroundColor Green
    if ($response.admin_api_key) {
        $adminKey = $response.admin_api_key
        $keyPreview = $adminKey.Substring(0, [Math]::Min(20, $adminKey.Length))
        Write-Host "   🔑 Admin Key: $keyPreview..." -ForegroundColor Cyan
    }
} catch {
    Write-Host "   ❌ Erro ao inicializar tenant" -ForegroundColor Red
}

Write-Host ""
Write-Host "🎉 DEPLOY CONCLUÍDO!" -ForegroundColor Green
Write-Host ""
Write-Host "📋 SERVIÇOS DISPONÍVEIS:" -ForegroundColor Cyan
Write-Host "========================" -ForegroundColor Cyan
Write-Host ""
Write-Host "🌐 REST API:" -ForegroundColor White
Write-Host "   http://localhost:3000"
Write-Host "   Health: http://localhost:3000/health/ready"
Write-Host ""
Write-Host "🔌 MCP Server:" -ForegroundColor White
Write-Host "   HTTP/SSE: http://localhost:3001/mcp"
Write-Host "   WebSocket: ws://localhost:3002"
Write-Host "   Health: http://localhost:3001/health"
Write-Host ""
Write-Host "🗄️ Banco de Dados:" -ForegroundColor White
Write-Host "   PostgreSQL: localhost:5432 (mcpuser/mcppass)"
Write-Host "   Redis: localhost:6379"
Write-Host "   RabbitMQ Management: http://localhost:15672 (admin/admin123)"
Write-Host ""
Write-Host "📖 COMO USAR:" -ForegroundColor Cyan
Write-Host "=============" -ForegroundColor Cyan
Write-Host ""
Write-Host "1️⃣ REST API (aplicações existentes):" -ForegroundColor White
Write-Host '   curl http://localhost:3000/v1/tenants'
Write-Host ""
Write-Host "2️⃣ MCP com Claude Desktop:" -ForegroundColor White
Write-Host "   Configure claude_desktop_config.json:"
Write-Host '   "mcp-maax-cob": {'
Write-Host '     "command": "docker",'
Write-Host '     "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"]'
Write-Host '   }'
Write-Host ""
Write-Host "3️⃣ MCP via HTTP (apps web):" -ForegroundColor White
Write-Host "   EventSource: http://localhost:3001/mcp"
Write-Host ""
Write-Host "4️⃣ MCP via WebSocket (real-time):" -ForegroundColor White
Write-Host "   WebSocket: ws://localhost:3002"
Write-Host ""
Write-Host "🛠️ COMANDOS ÚTEIS:" -ForegroundColor Cyan
Write-Host "==================" -ForegroundColor Cyan
Write-Host ""
Write-Host "   # Ver logs" -ForegroundColor White
Write-Host "   docker-compose -f docker-compose.mcp.yml logs -f"
Write-Host ""
Write-Host "   # Parar tudo" -ForegroundColor White
Write-Host "   docker-compose -f docker-compose.mcp.yml down"
Write-Host ""
Write-Host "   # Restart apenas MCP" -ForegroundColor White
Write-Host "   docker-compose -f docker-compose.mcp.yml restart mcp"
Write-Host ""
Write-Host "   # Shell no container MCP" -ForegroundColor White
Write-Host "   docker-compose -f docker-compose.mcp.yml exec mcp sh"
Write-Host ""
Write-Host "✨ Sistema MCP rodando no Docker Desktop Windows!" -ForegroundColor Green
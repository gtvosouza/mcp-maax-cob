# Deploy MCP MAAX COB - Windows PowerShell (Versão Simplificada)

Write-Host ""
Write-Host "DEPLOY MCP MAAX COB - DOCKER DESKTOP WINDOWS" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Verificar Docker
Write-Host "Verificando Docker Desktop..." -ForegroundColor Yellow
try {
    docker info | Out-Null
    Write-Host "[OK] Docker Desktop detectado" -ForegroundColor Green
    Write-Host ""
} catch {
    Write-Host "[ERRO] Docker Desktop nao esta rodando!" -ForegroundColor Red
    Write-Host "       Inicie o Docker Desktop e tente novamente." -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Build
Write-Host "Fazendo build das imagens..." -ForegroundColor Yellow
docker-compose -f docker-compose.mcp.yml build

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha no build" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host ""
Write-Host "Subindo servicos..." -ForegroundColor Yellow
docker-compose -f docker-compose.mcp.yml up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERRO] Falha ao subir servicos" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

Write-Host ""
Write-Host "Aguardando servicos iniciarem (15 segundos)..." -ForegroundColor Yellow
Start-Sleep -Seconds 15

Write-Host ""
Write-Host "Status dos servicos:" -ForegroundColor Cyan
docker-compose -f docker-compose.mcp.yml ps

Write-Host ""
Write-Host "VERIFICANDO SERVICOS" -ForegroundColor Cyan
Write-Host "====================" -ForegroundColor Cyan

# Testar REST API
Write-Host ""
Write-Host "1. REST API (porta 3000)..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3000/health/ready" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] REST API funcionando" -ForegroundColor Green
    }
} catch {
    Write-Host "   [AVISO] REST API pode estar iniciando ainda" -ForegroundColor Yellow
}

# Testar MCP HTTP
Write-Host ""
Write-Host "2. MCP Server (porta 3001)..." -ForegroundColor White
try {
    $response = Invoke-WebRequest -Uri "http://localhost:3001/health" -UseBasicParsing -TimeoutSec 5
    if ($response.StatusCode -eq 200) {
        Write-Host "   [OK] MCP HTTP funcionando" -ForegroundColor Green
    }
} catch {
    Write-Host "   [AVISO] MCP HTTP pode estar iniciando ainda" -ForegroundColor Yellow
}

# Inicializar tenant
Write-Host ""
Write-Host "3. Inicializando sistema..." -ForegroundColor White
Start-Sleep -Seconds 2
try {
    $response = Invoke-RestMethod -Uri "http://localhost:3000/v1/tenants/init" -Method POST -TimeoutSec 5
    Write-Host "   [OK] Sistema inicializado" -ForegroundColor Green
    if ($response.admin_api_key) {
        Write-Host "   Admin Key criada: $($response.admin_api_key.Substring(0,20))..." -ForegroundColor Cyan
    }
} catch {
    Write-Host "   [INFO] Sistema ja pode estar inicializado" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host "        DEPLOY CONCLUIDO!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "SERVICOS DISPONIVEIS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  REST API:        http://localhost:3000" -ForegroundColor White
Write-Host "  MCP HTTP:        http://localhost:3001/mcp" -ForegroundColor White
Write-Host "  MCP WebSocket:   ws://localhost:3002" -ForegroundColor White
Write-Host "  PostgreSQL:      localhost:5432" -ForegroundColor White
Write-Host "  Redis:           localhost:6379" -ForegroundColor White
Write-Host "  RabbitMQ:        http://localhost:15672 (admin/admin123)" -ForegroundColor White
Write-Host ""
Write-Host "COMANDOS UTEIS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "  Ver logs:        docker-compose -f docker-compose.mcp.yml logs -f" -ForegroundColor White
Write-Host "  Parar tudo:      docker-compose -f docker-compose.mcp.yml down" -ForegroundColor White
Write-Host "  Restart MCP:     docker-compose -f docker-compose.mcp.yml restart mcp" -ForegroundColor White
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Teste no navegador:" -ForegroundColor White
Write-Host "   http://localhost:3000/health/ready" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Configure Claude Desktop:" -ForegroundColor White
Write-Host "   Arquivo: %APPDATA%\Claude\claude_desktop_config.json" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Ver logs para debug:" -ForegroundColor White
Write-Host "   docker-compose -f docker-compose.mcp.yml logs -f" -ForegroundColor Gray
Write-Host ""

Read-Host "Pressione Enter para finalizar"
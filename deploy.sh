#!/bin/bash

# ============================================
#   MCP MAAX COB - Deploy Linux/Ubuntu
#   Portas: 4004 (HTTP), 4005 (WS), 5433 (DB)
# ============================================

echo ""
echo "MCP MAAX COB - Deploy Linux"
echo "====================================="
echo ""

# Verificar Docker
if ! docker info > /dev/null 2>&1; then
    echo "[ERRO] Docker não está rodando!"
    echo "       Instale ou inicie o Docker e tente novamente."
    echo ""
    exit 1
fi

echo "[OK] Docker detectado"
echo ""

# Limpar ambiente
echo "Limpando ambiente anterior..."
docker-compose -f docker-compose-final.yml down > /dev/null 2>&1

# Build
echo "Construindo imagem MCP..."
docker-compose -f docker-compose-final.yml build mcp
if [ $? -ne 0 ]; then
    echo "[ERRO] Falha no build"
    exit 1
fi

# Deploy
echo ""
echo "Iniciando serviços..."
docker-compose -f docker-compose-final.yml up -d
if [ $? -ne 0 ]; then
    echo "[ERRO] Falha ao iniciar serviços"
    exit 1
fi

# Aguardar
echo ""
echo "Aguardando serviços (20 segundos)..."
sleep 20

# Status
echo ""
echo "Status dos serviços:"
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Testar
echo ""
echo "Testando MCP Server..."
if curl -f -s http://localhost:4004/health > /dev/null 2>&1; then
    echo "[OK] MCP Server funcionando!"
else
    echo "[AVISO] MCP ainda iniciando..."
fi

# Informações
echo ""
echo "====================================="
echo "SERVIÇOS DISPONÍVEIS:"
echo "====================================="
echo ""
echo "MCP Server:"
echo "  Health: http://localhost:4004/health"
echo "  Tools:  http://localhost:4004/tools"
echo "  HTTP:   http://localhost:4004/mcp"
echo "  WS:     ws://localhost:4005"
echo ""
echo "PostgreSQL:"
echo "  Host: localhost"
echo "  Port: 5433"
echo "  User: mcpuser"
echo "  Pass: mcppass"
echo ""
echo "COMANDOS ÚTEIS:"
echo "  Ver logs:  docker-compose -f docker-compose-final.yml logs -f mcp"
echo "  Parar:     docker-compose -f docker-compose-final.yml down"
echo "  Reiniciar: docker-compose -f docker-compose-final.yml restart mcp"
echo ""
echo "CLAUDE DESKTOP CONFIG:"
echo '  {'
echo '    "mcpServers": {'
echo '      "mcp-maax-cob": {'
echo '        "command": "docker",'
echo '        "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"],'
echo '        "env": {"MCP_TRANSPORT": "stdio"}'
echo '      }'
echo '    }'
echo '  }'
echo ""
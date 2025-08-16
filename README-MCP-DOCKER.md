# 🐳 MCP MAAX COB - Docker Desktop

Deploy completo do sistema MCP no Docker Desktop com suporte a **múltiplos transportes**.

## 🚀 Deploy Automático

```bash
# Execute o script de deploy
./deploy-mcp.sh
```

## 📦 O que é criado

### Serviços Docker:
- **PostgreSQL** (porta 5432) - Banco de dados
- **Redis** (porta 6379) - Cache
- **RabbitMQ** (porta 5672, 15672) - Message queue
- **REST API** (porta 3000) - API existente
- **MCP Server** (portas 3001, 3002) - Servidor MCP

### Arquitetura:
```
┌─────────────────────────────────────────┐
│            Docker Desktop               │
├─────────────┬───────────────┬───────────┤
│  REST API   │  MCP Server   │    DBs    │
│ (port 3000) │ (3001, 3002)  │           │
├─────────────┼───────────────┼───────────┤
│  Fastify    │  3 Transportes│ Postgres  │
│   Server    │ STDIO+HTTP+WS │   Redis   │
└─────────────┴───────────────┴───────────┘
```

## 🔌 Transportes MCP Disponíveis

### 1. **STDIO** (Claude Desktop)
```json
{
  "mcpServers": {
    "mcp-maax-cob": {
      "command": "docker",
      "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"],
      "env": { "MCP_TRANSPORT": "stdio" }
    }
  }
}
```

### 2. **HTTP/SSE** (Apps Web)
```javascript
const eventSource = new EventSource('http://localhost:3001/mcp');
eventSource.onmessage = (event) => {
  console.log('MCP Message:', JSON.parse(event.data));
};
```

### 3. **WebSocket** (Real-time)
```javascript
const ws = new WebSocket('ws://localhost:3002');
ws.onmessage = (event) => {
  console.log('MCP Message:', JSON.parse(event.data));
};
```

## 🧪 Testando

### 1. Verificar serviços
```bash
docker-compose -f docker-compose.mcp.yml ps
```

### 2. Testar REST API
```bash
curl http://localhost:3000/health/ready
curl -X POST http://localhost:3000/v1/tenants/init
```

### 3. Testar MCP HTTP
```bash
curl http://localhost:3001/health
curl http://localhost:3001/tools
```

### 4. Testar MCP WebSocket
```bash
# Com wscat (instale: npm i -g wscat)
wscat -c ws://localhost:3002
```

## 🔧 Configuração Claude Desktop

### Arquivo: `claude_desktop_config.json`
Localizações:
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### Conteúdo:
```json
{
  "mcpServers": {
    "mcp-maax-cob": {
      "command": "docker",
      "args": [
        "exec", 
        "-i", 
        "mcp-maax-cob-mcp-1", 
        "node", 
        "dist/mcp.js"
      ],
      "env": {
        "MCP_TRANSPORT": "stdio"
      }
    }
  }
}
```

## 🛠️ Comandos Úteis

### Gerenciamento
```bash
# Parar tudo
docker-compose -f docker-compose.mcp.yml down

# Parar e limpar volumes
docker-compose -f docker-compose.mcp.yml down --volumes

# Restart apenas MCP
docker-compose -f docker-compose.mcp.yml restart mcp

# Ver logs
docker-compose -f docker-compose.mcp.yml logs -f mcp
```

### Debug
```bash
# Shell no container MCP
docker-compose -f docker-compose.mcp.yml exec mcp sh

# Testar MCP diretamente
docker exec -i mcp-maax-cob-mcp-1 node dist/mcp.js

# Ver variáveis de ambiente
docker-compose -f docker-compose.mcp.yml exec mcp env
```

### Rebuild
```bash
# Rebuild apenas MCP
docker-compose -f docker-compose.mcp.yml build --no-cache mcp

# Rebuild tudo
docker-compose -f docker-compose.mcp.yml build --no-cache
```

## 📊 Monitoramento

### Health Checks
- REST API: http://localhost:3000/health/ready
- MCP HTTP: http://localhost:3001/health
- PostgreSQL: Conectar em localhost:5432
- Redis: `redis-cli -h localhost ping`
- RabbitMQ: http://localhost:15672 (admin/admin123)

### Logs
```bash
# Todos os serviços
docker-compose -f docker-compose.mcp.yml logs -f

# Apenas MCP
docker-compose -f docker-compose.mcp.yml logs -f mcp

# Últimas 50 linhas
docker-compose -f docker-compose.mcp.yml logs --tail=50 mcp
```

## 🎯 Uso no Claude

Após configurar, você pode usar no Claude Desktop:

```
Crie uma cobrança de R$ 100,00 para João Silva (CPF: 12345678901) 
com vencimento para 31/12/2025, aceitando boleto e PIX.
```

O Claude irá usar a ferramenta `create_charge` automaticamente!

## 🔒 Produção

Para produção, ajuste:

1. **Senhas**: Mude todas as senhas padrão
2. **Volumes**: Use volumes externos para dados
3. **Network**: Configure rede personalizada
4. **SSL**: Adicione certificados HTTPS
5. **Monitoring**: Adicione Prometheus/Grafana

## 🐛 Troubleshooting

### MCP não conecta
```bash
# Verificar se container está rodando
docker ps | grep mcp

# Verificar logs
docker logs mcp-maax-cob-mcp-1

# Testar STDIO manual
docker exec -i mcp-maax-cob-mcp-1 node dist/mcp.js
```

### Banco não conecta
```bash
# Verificar PostgreSQL
docker-compose -f docker-compose.mcp.yml exec db pg_isready -U mcpuser

# Verificar variáveis
docker-compose -f docker-compose.mcp.yml exec mcp env | grep POSTGRES
```

### Ports em uso
```bash
# Verificar portas
netstat -tlnp | grep -E ":(3000|3001|3002|5432|6379)"

# Parar outros serviços se necessário
docker stop $(docker ps -q)
```

---

## ✨ Resultado

Você terá:
- ✅ REST API funcionando (porta 3000)
- ✅ MCP Server com 3 transportes (3001, 3002, stdio)
- ✅ Banco de dados completo
- ✅ Integração com Claude Desktop
- ✅ Suporte a apps web e WebSocket
- ✅ Monitoramento e health checks

🎉 **Sistema MCP completo rodando no Docker Desktop!**
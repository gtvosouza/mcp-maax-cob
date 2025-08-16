# 🚀 MCP MAAX COB - Sistema de Cobrança Unificada

Sistema de cobrança unificada que integra múltiplos bancos brasileiros através de um servidor **MCP (Model Context Protocol)** compatível com Claude Desktop e outras aplicações.

## 🏦 Bancos Integrados

### ✅ Funcionando 100%
- **🏆 Cora** - API REST completa
- **🏆 Banco do Brasil** - OAuth2 + Boletos + PIX  
- **🏆 Sicredi** - OAuth2 + Boletos + PIX
- **🔧 Mock** - Para desenvolvimento e testes

### 🔄 Implementados (aguardando certificados)
- **Itaú** - mTLS + Certificados

## 📡 Protocolos Suportados

### REST API (Porta 3000)
Compatível com aplicações existentes:
```bash
curl -X POST http://localhost:3000/v1/charges \
  -H "X-Public-Api-Key: pk_..." \
  -d '{"provider_id": "...", "amount": 1000}'
```

### MCP Server (Múltiplos Transportes)
Compatible com Claude Desktop e outras aplicações MCP:

- **STDIO** - Claude Desktop
- **HTTP/SSE** - Aplicações web (porta 3001)
- **WebSocket** - Real-time (porta 3002)
- **Hybrid** - Todos simultaneamente

## 🚀 Deploy Rápido

### Docker Desktop (Recomendado)
```bash
# Clone o repositório
git clone <repo-url>
cd mcp-maax-cob

# Deploy automático
./deploy-mcp.sh
```

### Desenvolvimento Local
```bash
# Instalar dependências
npm install

# REST API
npm run dev

# MCP Server
npm run mcp:stdio    # Claude Desktop
npm run mcp:http     # Web (porta 3001)
npm run mcp:ws       # WebSocket (porta 3002)
npm run mcp:hybrid   # Todos juntos
```

## 🔧 Configuração Claude Desktop

### 1. Build do projeto
```bash
npm run build
```

### 2. Localizar arquivo de configuração
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`  
- **Linux**: `~/.config/Claude/claude_desktop_config.json`

### 3. Adicionar configuração
```json
{
  "mcpServers": {
    "mcp-maax-cob": {
      "command": "node",
      "args": ["/caminho/para/mcp-maax-cob/dist/mcp.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "POSTGRES_HOST": "localhost",
        "POSTGRES_DB": "mcp",
        "POSTGRES_USER": "mcpuser",
        "POSTGRES_PASSWORD": "mcppass"
      }
    }
  }
}
```

### 4. Com Docker
```json
{
  "mcpServers": {
    "mcp-maax-cob": {
      "command": "docker",
      "args": ["exec", "-i", "mcp-maax-cob-mcp-1", "node", "dist/mcp.js"]
    }
  }
}
```

## 🛠️ Ferramentas MCP

O Claude Desktop terá acesso às seguintes ferramentas:

- **`create_charge`** - Criar cobrança/boleto/PIX
- **`retrieve_charge`** - Consultar status de cobrança
- **`list_charges`** - Listar cobranças com paginação
- **`cancel_charge`** - Cancelar cobrança
- **`apply_instruction`** - Aplicar instruções (mudança vencimento, etc.)

## 📊 Exemplo de Uso no Claude

```
Crie uma cobrança de R$ 150,00 para João Silva (CPF: 12345678901) 
com vencimento para 31/12/2025, aceitando boleto e PIX.
```

O Claude automaticamente usará a ferramenta `create_charge` com os parâmetros corretos.

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────┐
│              Clientes                   │
├─────────┬─────────┬─────────┬───────────┤
│ Claude  │ Apps    │ REST    │ WebSocket │
│Desktop  │ Web     │ API     │ Clients   │
└────┬────┴────┬────┴────┬────┴─────┬─────┘
     │ STDIO   │ HTTP    │ REST     │ WS
     └─────────┼─────────┼──────────┘
               ▼         ▼
     ┌─────────────────────────────────────┐
     │         MCP MAAX COB                │
     │    (Servidor Unificado)             │
     └─────────────┬───────────────────────┘
                   ▼
     ┌─────────────────────────────────────┐
     │        Adapters Bancários           │
     ├─────────┬─────────┬─────────────────┤
     │  Cora   │   BB    │   Sicredi       │
     └─────────┴─────────┴─────────────────┘
```

## 📚 Documentação

- **[INSTALL-CLAUDE.md](INSTALL-CLAUDE.md)** - Instalação detalhada no Claude Desktop
- **[README-MCP-DOCKER.md](README-MCP-DOCKER.md)** - Deploy completo no Docker
- **[PRODUCTION.md](PRODUCTION.md)** - Configuração para produção
- **[teste/README.md](teste/README.md)** - Scripts de teste e desenvolvimento

## 🔒 Segurança

- Criptografia AES-256 para credenciais
- Rate limiting configurável
- Headers de segurança (Helmet)
- Validação de esquemas (Zod)
- Logs estruturados
- Health checks

## 📦 Serviços Inclusos

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| **REST API** | 3000 | Servidor Fastify principal |
| **MCP HTTP** | 3001 | Server-Sent Events |
| **MCP WebSocket** | 3002 | WebSocket real-time |
| **PostgreSQL** | 5432 | Banco de dados |
| **Redis** | 6379 | Cache e sessões |
| **RabbitMQ** | 5672, 15672 | Message queue + Management |

## 🧪 Testando

### Verificar instalação
```bash
# Health checks
curl http://localhost:3000/health/ready
curl http://localhost:3001/health

# Inicializar sistema
curl -X POST http://localhost:3000/v1/tenants/init
```

### Criar cobrança de teste
```bash
curl -X POST http://localhost:3000/v1/charges \
  -H "X-Public-Api-Key: pk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "mock-provider",
    "amount": 10000,
    "due_date": "2025-12-31",
    "payment_methods": ["boleto", "pix"],
    "customer": {
      "name": "João Silva",
      "document": "12345678901"
    }
  }'
```

## 🛠️ Comandos Úteis

```bash
# Desenvolvimento
npm run dev          # REST API modo watch
npm run mcp:stdio    # MCP para Claude Desktop
npm run mcp:hybrid   # Todos os transportes MCP

# Build e produção
npm run build        # Compilar TypeScript
npm start            # REST API produção

# Docker
./deploy-mcp.sh      # Deploy completo
docker-compose -f docker-compose.mcp.yml logs -f

# Testes
cd teste/
./test-mcp.sh       # Testar MCP
```

## 🐛 Troubleshooting

### MCP não aparece no Claude
1. Verificar se o build foi feito: `npm run build`
2. Verificar caminho no `claude_desktop_config.json`
3. Reiniciar Claude Desktop
4. Verificar logs: `docker logs mcp-maax-cob-mcp-1`

### Erro de banco
1. Verificar PostgreSQL: `docker-compose ps`
2. Verificar credenciais no `.env`
3. Inicializar banco: `curl -X POST http://localhost:3000/v1/tenants/init`

### Portas em uso
```bash
# Verificar portas ocupadas
netstat -tlnp | grep -E ":(3000|3001|3002)"

# Parar Docker se necessário
docker-compose down
```

## 🎯 Próximos Passos

1. **Certificados Itaú** - Completar integração mTLS
2. **Mais bancos** - Integrar Bradesco, Santander, etc.
3. **Webhooks** - Sistema de notificações em tempo real
4. **Dashboard** - Interface web para monitoramento
5. **Testes automatizados** - CI/CD pipeline

## 📞 Suporte

- **GitHub Issues** - Reportar bugs e solicitar features
- **Documentação** - Arquivos markdown inclusos
- **Logs** - `docker-compose logs -f` para debug

---

## 🎉 Resultado

Com este sistema você terá:

✅ **Integração com múltiplos bancos brasileiros**  
✅ **Servidor MCP compatível com Claude Desktop**  
✅ **REST API para aplicações existentes**  
✅ **Deploy Docker completo e configurável**  
✅ **Suporte a boletos e PIX**  
✅ **Monitoramento e métricas**  
✅ **Documentação completa**

**Sistema de cobrança moderno, escalável e integrado com IA!** 🚀
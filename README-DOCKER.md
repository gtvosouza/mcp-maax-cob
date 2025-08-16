# 🐳 MCP MAAX COB - Docker Deploy

Sistema de cobrança unificada com integração para múltiplos bancos brasileiros.

## 🏦 Bancos Integrados e Testados

### ✅ Funcionando 100%
- **🏆 Cora** - API funcionando
- **🏆 Banco do Brasil** - OAuth2 + Boletos + PIX  
- **🏆 Sicredi** - OAuth2 + Boletos + PIX
- **🔧 Mock** - Para testes

### 🔄 Implementados (aguardando credenciais)
- **Itaú** - mTLS + Certificados
- **Outros bancos** - Extensível

## 🚀 Deploy Rápido

### Pré-requisitos
- Docker
- Docker Compose  
- Node.js (para build)

### 1️⃣ Deploy Automático
```bash
# Clone e entre no diretório
git clone <repo>
cd mcp-maax-cob

# Execute o script de deploy
./deploy.sh
```

### 2️⃣ Deploy Manual
```bash
# 1. Build da aplicação
npm run build

# 2. Subir todos os serviços
docker compose up -d

# 3. Verificar status
docker compose ps
curl http://localhost:3000/health/ready
```

## 📋 Serviços Inclusos

| Serviço | Porta | Descrição |
|---------|-------|-----------|
| **API** | 3000 | Servidor principal MCP |
| **PostgreSQL** | 5432 | Banco de dados |
| **Redis** | 6379 | Cache e sessões |
| **RabbitMQ** | 5672, 15672 | Message queue + Management |

## 🔧 Configuração

### Variáveis de Ambiente (.env.docker)
```bash
# API
PORT=3000
NODE_ENV=development

# Database
POSTGRES_HOST=db
POSTGRES_DB=mcp
POSTGRES_USER=mcpuser  
POSTGRES_PASSWORD=mcppass

# Cache & Queue
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://rabbitmq:5672

# Security
ENCRYPTION_KEY_HEX=<generated-key>
WEBHOOK_HMAC_SECRET=mcp-webhook-secret-2025
RATE_LIMIT=120
```

## 🧪 Testando as Integrações

### 1. Health Check
```bash
curl http://localhost:3000/health/ready
```

### 2. Inicializar Tenant
```bash
curl -X POST http://localhost:3000/v1/tenants/init
```

### 3. Configurar Provider (exemplo Cora)
```bash
curl -X POST http://localhost:3000/v1/admin/providers \
  -H "X-Admin-Api-Key: sk_admin_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "cora",
    "friendly_name": "Conta Cora",
    "credentials": {
      "api_key": "sua-api-key",
      "private_key": "sua-private-key"
    }
  }'
```

### 4. Gerar API Key
```bash
curl -X POST http://localhost:3000/v1/admin/api-keys \
  -H "X-Admin-Api-Key: sk_admin_..."
```

### 5. Criar Cobrança
```bash
curl -X POST http://localhost:3000/v1/charges \
  -H "X-Public-Api-Key: pk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider-id",
    "amount": 10000,
    "due_date": "2025-12-31",
    "payment_methods": ["boleto", "pix"],
    "customer": {
      "name": "João Silva",
      "document": "12345678901"
    }
  }'
```

## 📊 Monitoramento

### Logs
```bash
# Ver logs da API
docker compose logs api -f

# Ver logs de todos os serviços
docker compose logs -f
```

### Status dos Containers
```bash
docker compose ps
```

### Métricas
- Health: `http://localhost:3000/health/ready`
- RabbitMQ Management: `http://localhost:15672` (guest/guest)

## 🛠️ Comandos Úteis

```bash
# Parar tudo
docker compose down

# Parar e remover volumes
docker compose down --volumes

# Reiniciar apenas a API
docker compose restart api

# Rebuild da imagem
docker compose build --no-cache api

# Ver recursos utilizados
docker compose top
```

## 🐛 Troubleshooting

### API não inicia
```bash
# Verificar logs
docker compose logs api

# Verificar conectividade com DB
docker compose exec api sh
# Dentro do container:
# nc -zv db 5432
```

### Problemas de conexão
```bash
# Verificar se portas estão liberadas
netstat -tlnp | grep :3000

# Verificar network do Docker
docker network ls
docker network inspect mcp-maax-cob_default
```

### Reset completo
```bash
# Parar tudo e limpar
docker compose down --volumes --rmi all
docker system prune -a

# Subir novamente
./deploy.sh
```

## 🎯 Próximos Passos

1. **Produção**: Usar `docker-compose.production.yml`
2. **HTTPS**: Configurar nginx/traefik
3. **Backup**: Implementar backup do PostgreSQL
4. **Monitoring**: Adicionar Prometheus/Grafana
5. **CI/CD**: Pipeline de deploy automático

---

## 📞 Suporte

- **Logs**: `docker compose logs -f`
- **Health**: `http://localhost:3000/health/ready`
- **Database**: Conectar em `localhost:5432`

🚀 **Sistema pronto para produção!**
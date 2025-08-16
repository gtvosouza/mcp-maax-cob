# 🚀 MCP MAAX COB - Deploy Produção

## ✅ Status das Integrações

### 🏆 Bancos Funcionando 100%
- **Cora** ✅ - API integrada e testada
- **Banco do Brasil** ✅ - OAuth2 + Boletos + PIX funcionando  
- **Sicredi** ✅ - OAuth2 + Boletos + PIX funcionando

### 🔄 Bancos Implementados
- **Itaú** - Aguardando certificados mTLS
- **Mock** - Para desenvolvimento e testes

---

## 🐳 Deploy Docker (Recomendado)

### 1. Preparação
```bash
# Clone do repositório
git clone <repo-url>
cd mcp-maax-cob

# Configurar ambiente
cp .env.example .env.production
```

### 2. Configuração Produção (.env.production)
```bash
# API
PORT=3000
NODE_ENV=production

# Database - Configure com suas credenciais
POSTGRES_HOST=db
POSTGRES_DB=mcp_prod
POSTGRES_USER=mcp_user
POSTGRES_PASSWORD=sua-senha-forte

# Cache & Queue
REDIS_URL=redis://redis:6379
RABBITMQ_URL=amqp://rabbitmq:5672

# Security - IMPORTANTE: Gere chaves novas!
ENCRYPTION_KEY_HEX=$(openssl rand -hex 32)
WEBHOOK_HMAC_SECRET=sua-chave-webhook-forte
RATE_LIMIT=200

# URLs externas (se aplicável)
# POSTGRES_HOST=seu-db-externo.com
# REDIS_URL=redis://seu-redis.com:6379
```

### 3. Deploy
```bash
# Usar compose de produção
docker compose -f docker-compose.production.yml up -d

# Ou usar script automatizado
./deploy.sh

# Testar
./test-deploy.sh
```

---

## 🔧 Configuração dos Bancos

### 1. Inicializar Sistema
```bash
curl -X POST http://localhost:3000/v1/tenants/init
# Salve o admin_api_key retornado!
```

### 2. Cora (Já funcionando)
```bash
curl -X POST http://localhost:3000/v1/admin/providers \
  -H "X-Admin-Api-Key: sk_admin_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "cora",
    "friendly_name": "Conta Cora Produção",
    "credentials": {
      "api_key": "SUA_API_KEY_CORA",
      "private_key": "SUA_PRIVATE_KEY_CORA"
    },
    "provider_specific_config": {
      "webhook_url": "https://seu-dominio.com/webhooks/cora"
    }
  }'
```

### 3. Banco do Brasil (Testado e funcionando)
```bash
curl -X POST http://localhost:3000/v1/admin/providers \
  -H "X-Admin-Api-Key: sk_admin_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "bancoBrasil",
    "friendly_name": "Banco do Brasil Produção",
    "credentials": {
      "client_id": "SEU_CLIENT_ID_BB",
      "client_secret": "SEU_CLIENT_SECRET_BB",
      "developer_key": "SEU_DEVELOPER_KEY_BB"
    },
    "provider_specific_config": {
      "convenio": "SEU_CONVENIO",
      "carteira": "SUA_CARTEIRA",
      "agencia": "SUA_AGENCIA",
      "conta": "SUA_CONTA",
      "sandbox": false
    }
  }'
```

### 4. Sicredi (Testado e funcionando)
```bash
curl -X POST http://localhost:3000/v1/admin/providers \
  -H "X-Admin-Api-Key: sk_admin_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_type": "sicredi",
    "friendly_name": "Sicredi Produção",
    "credentials": {
      "x_api_key": "SUA_API_KEY_SICREDI",
      "username": "SEU_USERNAME_SICREDI",
      "password": "SUA_SENHA_SICREDI"
    },
    "provider_specific_config": {
      "cooperativa": "SUA_COOPERATIVA",
      "posto": "SEU_POSTO",
      "codigoBeneficiario": "SEU_CODIGO_BENEFICIARIO"
    }
  }'
```

---

## 🔑 Gerar API Keys

### 1. Admin API Key (já criada no init)
```bash
# Use a key retornada no /v1/tenants/init
export ADMIN_KEY="sk_admin_..."
```

### 2. Public API Keys (para clientes)
```bash
curl -X POST http://localhost:3000/v1/admin/api-keys \
  -H "X-Admin-Api-Key: $ADMIN_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Cliente Produção",
    "description": "API key para ambiente de produção"
  }'
```

---

## 🧪 Testar Integração

### 1. Criar Cobrança
```bash
curl -X POST http://localhost:3000/v1/charges \
  -H "X-Public-Api-Key: pk_..." \
  -H "Content-Type: application/json" \
  -d '{
    "provider_id": "provider-id-aqui",
    "amount": 10000,
    "due_date": "2025-12-31",
    "payment_methods": ["boleto", "pix"],
    "customer": {
      "name": "Cliente Teste",
      "document": "12345678901",
      "email": "cliente@email.com"
    },
    "reference_id": "pedido-123"
  }'
```

### 2. Consultar Cobrança
```bash
curl -H "X-Public-Api-Key: pk_..." \
  http://localhost:3000/v1/charges/{charge_id}
```

### 3. Cancelar Cobrança
```bash
curl -X POST -H "X-Public-Api-Key: pk_..." \
  http://localhost:3000/v1/charges/{charge_id}/cancel
```

---

## 🔒 Segurança Produção

### 1. HTTPS/SSL
```bash
# Use nginx ou traefik como proxy
# Exemplo nginx.conf:
server {
    listen 443 ssl;
    server_name api.seudominio.com;
    
    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;
    
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### 2. Firewall
```bash
# Liberar apenas portas necessárias
# 443 (HTTPS), 80 (HTTP redirect)
# Fechar 3000 (acesso direto)
```

### 3. Backup Database
```bash
# Script de backup
#!/bin/bash
docker exec postgres_container pg_dump -U usuario -d mcp_prod > backup_$(date +%Y%m%d).sql
```

---

## 📊 Monitoramento

### 1. Health Checks
```bash
# Configure monitoramento para:
curl http://localhost:3000/health/ready
curl http://localhost:3000/health/live
```

### 2. Logs
```bash
# Configurar rotação de logs
docker compose logs api -f | tee /var/log/mcp-api.log
```

### 3. Métricas
```bash
# Endpoints de métricas (se configurado)
curl http://localhost:3000/metrics
```

---

## 🚨 Troubleshooting

### API não responde
```bash
# Verificar logs
docker compose logs api

# Verificar recursos
docker stats

# Reiniciar
docker compose restart api
```

### Erro de banco
```bash
# Verificar conexão
docker compose exec api nc -zv db 5432

# Ver logs do postgres
docker compose logs db
```

### Problemas de integração
```bash
# Verificar providers
curl -H "X-Admin-Api-Key: sk_admin_..." \
  http://localhost:3000/v1/admin/providers

# Testar com mock primeiro
curl -X POST http://localhost:3000/v1/admin/providers \
  -H "X-Admin-Api-Key: sk_admin_..." \
  -H "Content-Type: application/json" \
  -d '{"provider_type":"mock","friendly_name":"Test","credentials":{}}'
```

---

## 📞 Suporte

### Endpoints importantes
- **Health**: `/health/ready`
- **Docs**: `/docs` (se habilitado)
- **Admin**: `/v1/admin/*`
- **API**: `/v1/charges/*`

### Bancos funcionando
- ✅ **Cora**: 100% testado
- ✅ **Banco do Brasil**: OAuth + Boletos + PIX
- ✅ **Sicredi**: OAuth + Boletos + PIX

🎉 **Sistema pronto para produção!**
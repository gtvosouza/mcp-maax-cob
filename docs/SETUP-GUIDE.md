# 🚀 Guia de Configuração - MAAX COB MCP

## Pré-requisitos

- Node.js 18+ instalado
- Redis rodando (para cache e sessões)
- Backend-maax-agent configurado

---

## 📝 Passo 1: Configurar Variáveis de Ambiente

### Backend-maax-agent

Edite `/home/gtvosouza/maax-bots/backend-maax-agent/.env`:

```bash
# MAAX COB (Sistema de Cobrança)
MAAX_COB_MCP_URL=http://localhost:3001/mcp
MAAX_COB_TIMEOUT_MS=60000
MAAX_COB_TOKEN_SECRET=dev-maax-cob-secret-change-in-production
MAAX_COB_TOKEN_EXPIRES_IN=30d
```

### MAAX COB Server

Edite `/home/gtvosouza/maax-mcp/mcp-maax-cob/.env`:

```bash
# --- API ---
PORT=8009
NODE_ENV=development

# --- Redis ---
REDIS_URL=redis://localhost:6379

# --- Tokens ---
# ⚠️ IMPORTANTE: Este secret DEVE ser o MESMO do backend-maax-agent!
MCP_TOKEN_SECRET=dev-maax-cob-secret-change-in-production

# --- MCP ---
MCP_HTTP_PORT=3001
MCP_TRANSPORT=http
```

**⚠️ ATENÇÃO:** O `MCP_TOKEN_SECRET` **DEVE SER IDÊNTICO** nos dois servidores!

---

## 🔐 Passo 2: Gerar Secret Seguro (Produção)

Para produção, gere um secret forte:

```bash
# Opção 1: OpenSSL
openssl rand -base64 32

# Opção 2: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Use o mesmo valor em:
- `MAAX_COB_TOKEN_SECRET` (backend-maax-agent)
- `MCP_TOKEN_SECRET` (mcp-maax-cob)

---

## 📦 Passo 3: Instalar Dependências

### Backend-maax-agent

```bash
cd /home/gtvosouza/maax-bots/backend-maax-agent
npm install
npm run build
```

### MAAX COB Server

```bash
cd /home/gtvosouza/maax-mcp/mcp-maax-cob
npm install
npm run build
```

---

## 🏃 Passo 4: Iniciar Servidores

### Terminal 1: Redis

```bash
redis-server
# Deve rodar em localhost:6379
```

### Terminal 2: MAAX COB Server

```bash
cd /home/gtvosouza/maax-mcp/mcp-maax-cob
npm run mcp:http

# Saída esperada:
# [MCP] Iniciando com transporte: http
# [MCP] HTTP/SSE server rodando em http://localhost:3001
# [MCP] SSE endpoint: http://localhost:3001/mcp
```

### Terminal 3: Backend-maax-agent

```bash
cd /home/gtvosouza/maax-bots/backend-maax-agent
npm run dev

# Saída esperada:
# Server listening at http://0.0.0.0:3000
```

---

## ✅ Passo 5: Verificar Configuração

### 1. Health Check MAAX COB

```bash
curl http://localhost:3001/health
```

**Resposta esperada:**
```json
{
  "status": "ok",
  "transport": "http/sse",
  "mcp_version": "2.0.0"
}
```

### 2. Testar Autenticação JWT

**Gerar um token de teste:**

```bash
node -e "
const jwt = require('jsonwebtoken');
const token = jwt.sign(
  {
    company: 'test123',
    provider: 'banco_do_brasil',
    credentials: {
      client_id: 'test_client',
      client_secret: 'test_secret',
      developer_application_key: 'test_key'
    }
  },
  'dev-maax-cob-secret-change-in-production',
  { expiresIn: '1h' }
);
console.log(token);
"
```

**Testar endpoint MCP:**

```bash
curl -H "Authorization: Bearer SEU_TOKEN_AQUI" \
     http://localhost:3001/mcp
```

**Resposta esperada (401 se sem token):**
```json
{
  "error": "Invalid or missing Bearer token",
  "code": "UNAUTHORIZED"
}
```

**Resposta esperada (sucesso com token válido):**
Conexão SSE estabelecida.

### 3. Verificar Backend-maax-agent

```bash
curl -H "Authorization: Bearer SEU_TOKEN_DO_BACKEND" \
     http://localhost:3000/mcps/official
```

**Resposta esperada:**
```json
{
  "items": [
    {
      "id": "codex-cigam",
      "name": "Codex CIGAM",
      ...
    },
    {
      "id": "maax-cob",
      "name": "MAAX COB",
      "fields": [
        { "key": "provider", ... },
        { "key": "bb_client_id", ... },
        ...
      ]
    }
  ]
}
```

---

## 🧪 Passo 6: Testar Configuração de Provedor

### Banco do Brasil (padrão)

```bash
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:3000/mcps/official/maax-cob"
```

**Campos retornados:**
- `provider` (select)
- `bb_client_id` (string)
- `bb_client_secret` (password)
- `bb_app_key` (string)
- `bb_account_number` (string)
- `bb_account_type` (select)
- `bb_sandbox` (boolean)
- `mcpUrl` (string)

### Cora

```bash
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:3000/mcps/official/maax-cob?provider=cora"
```

**Campos retornados:**
- `provider` (select)
- `cora_client_id` (string)
- `cora_client_secret` (password)
- `cora_account_id` (string)
- `cora_sandbox` (boolean)
- `mcpUrl` (string)

### Sicredi

```bash
curl -H "Authorization: Bearer TOKEN" \
     "http://localhost:3000/mcps/official/maax-cob?provider=sicredi"
```

**Campos retornados:**
- `provider` (select)
- `sicredi_api_key` (password)
- `sicredi_cooperativa` (string)
- `sicredi_posto` (string)
- `sicredi_codigo_beneficiario` (string)
- `sicredi_sandbox` (boolean)
- `mcpUrl` (string)

---

## 🐛 Troubleshooting

### Erro: "MAAX_COB_TOKEN_SECRET is not configured in environment"

**Causa**: Variável `MAAX_COB_TOKEN_SECRET` não existe no `.env` do backend-maax-agent.

**Solução:**
```bash
cd /home/gtvosouza/maax-bots/backend-maax-agent
echo "MAAX_COB_TOKEN_SECRET=dev-maax-cob-secret-change-in-production" >> .env
```

Reinicie o backend.

---

### Erro: "Invalid or expired token" no MAAX COB

**Causa**: O `MCP_TOKEN_SECRET` do MAAX COB é **diferente** do `MAAX_COB_TOKEN_SECRET` do backend.

**Solução:**

1. Verifique o secret do backend:
   ```bash
   grep MAAX_COB_TOKEN_SECRET /home/gtvosouza/maax-bots/backend-maax-agent/.env
   ```

2. Copie o valor e atualize o MAAX COB:
   ```bash
   cd /home/gtvosouza/maax-mcp/mcp-maax-cob
   # Edite .env e coloque o MESMO valor em MCP_TOKEN_SECRET
   ```

3. Reinicie o MAAX COB server.

---

### Erro: "fetch failed" ao acessar MAAX COB

**Causa**: MAAX COB server não está rodando ou rodando na porta errada.

**Solução:**

1. Verifique se está rodando:
   ```bash
   curl http://localhost:3001/health
   ```

2. Se não responder, inicie:
   ```bash
   cd /home/gtvosouza/maax-mcp/mcp-maax-cob
   npm run mcp:http
   ```

3. Verifique a porta no `.env`:
   ```bash
   grep MCP_HTTP_PORT .env
   # Deve ser: MCP_HTTP_PORT=3001
   ```

---

### Erro: Redis connection failed

**Causa**: Redis não está rodando.

**Solução:**
```bash
# Iniciar Redis
redis-server

# Ou em background
redis-server --daemonize yes

# Verificar se está rodando
redis-cli ping
# Resposta esperada: PONG
```

---

## 📊 Checklist de Configuração

- [ ] Redis rodando em `localhost:6379`
- [ ] Backend `.env` tem `MAAX_COB_TOKEN_SECRET`
- [ ] MAAX COB `.env` tem `MCP_TOKEN_SECRET` (mesmo valor)
- [ ] Backend rodando em `localhost:3000`
- [ ] MAAX COB rodando em `localhost:3001`
- [ ] `/health` retorna status 200
- [ ] `/mcps/official` retorna MAAX COB
- [ ] Query `?provider=cora` retorna campos Cora

---

## 🎯 Próximos Passos

Após configuração completa:

1. **Frontend**: Implementar formulário dinâmico com `?provider=<banco>`
2. **Credenciais**: Obter credenciais reais do Banco do Brasil
3. **mTLS**: Configurar certificados SSL para produção
4. **Produção**: Gerar secrets fortes e configurar URLs de produção

---

## 📚 Documentação Adicional

- [AUTHENTICATION-FLOW.md](AUTHENTICATION-FLOW.md) - Fluxo JWT completo
- [BB-MTLS-SETUP.md](BB-MTLS-SETUP.md) - Configuração mTLS Banco do Brasil
- [backend-maax-agent/claude/maax-cob-dynamic-fields-api.md](../maax-bots/backend-maax-agent/claude/maax-cob-dynamic-fields-api.md) - API de campos dinâmicos

---

## 🔒 Segurança em Produção

### Secrets

```bash
# Gerar secrets fortes
MAAX_COB_TOKEN_SECRET=$(openssl rand -base64 32)
WEBHOOK_HMAC_SECRET=$(openssl rand -base64 32)
ENCRYPTION_KEY_HEX=$(openssl rand -hex 32)
```

### HTTPS

Configure proxy reverso (Nginx/Caddy) para HTTPS:

```nginx
server {
    listen 443 ssl;
    server_name mcp.maax.com.br;

    location /mcp {
        proxy_pass http://localhost:3001;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }
}
```

### Firewall

```bash
# Permitir apenas backend acessar MAAX COB
ufw allow from 10.0.2.9 to any port 3001
ufw deny 3001
```

---

## ✅ Configuração Concluída!

Se todos os checks passaram, o MAAX COB está pronto para uso! 🎉

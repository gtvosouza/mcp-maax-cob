# 🔐 Fluxo de Autenticação MAAX COB

## Arquitetura de Autenticação JWT

O MAAX COB utiliza **autenticação JWT Bearer Token** para validar requisições vindas do `backend-maax-agent`, seguindo o mesmo padrão do Codex CIGAM.

---

## 📊 Diagrama de Fluxo

```
┌─────────────────┐         ┌──────────────────────┐         ┌─────────────────┐
│   Frontend      │         │  backend-maax-agent  │         │   MAAX COB      │
│  (Configuração) │         │                      │         │   MCP Server    │
└────────┬────────┘         └──────────┬───────────┘         └────────┬────────┘
         │                             │                              │
         │ 1. Usuário configura        │                              │
         │    - Company                │                              │
         │    - Provider (BB, Cora...) │                              │
         │    - API Key                │                              │
         └────────────────────────────>│                              │
                                       │                              │
                                       │ 2. Backend gera JWT          │
                                       │    com payload:              │
                                       │    {                         │
                                       │      company,                │
                                       │      provider,               │
                                       │      credentials: {          │
                                       │        apiKey                │
                                       │      },                      │
                                       │      meta                    │
                                       │    }                         │
                                       │                              │
                                       │ 3. Requisições MCP com       │
                                       │    Authorization: Bearer JWT │
                                       └─────────────────────────────>│
                                       │                              │
                                       │                              │ 4. MAAX COB valida JWT
                                       │                              │    usando MCP_TOKEN_SECRET
                                       │                              │
                                       │                              │ 5. Extrai credenciais
                                       │                              │    do payload JWT
                                       │                              │
                                       │ 6. Resposta MCP              │
                                       │<─────────────────────────────│
                                       │                              │
```

---

## 🔑 Configuração

### 1. Backend-maax-agent (.env)

```bash
# Secret para assinar tokens JWT (deve ser o MESMO no MAAX COB)
MAAX_COB_TOKEN_SECRET=sua_chave_secreta_segura_aqui

# URL do servidor MAAX COB MCP
MAAX_COB_MCP_URL=http://localhost:3001/mcp

# Timeout e expiração
MAAX_COB_TIMEOUT_MS=60000
MAAX_COB_TOKEN_EXPIRES_IN=30d
```

### 2. MAAX COB Server (.env)

```bash
# Secret para validar tokens JWT (deve ser o MESMO no backend)
MCP_TOKEN_SECRET=sua_chave_secreta_segura_aqui

# Porta do servidor HTTP
MCP_HTTP_PORT=3001

# Transporte
MCP_TRANSPORT=http
```

⚠️ **IMPORTANTE**: O `MCP_TOKEN_SECRET` deve ser **idêntico** nos dois servidores!

---

## 🔐 Payload JWT

Quando o backend-maax-agent gera o JWT, ele inclui:

```typescript
const payload = {
  company: "123",           // ID da empresa
  provider: "banco_do_brasil", // Provedor bancário
  credentials: {
    apiKey: "mcp_key_abc123"  // API Key do usuário
  },
  meta: {
    timeoutMs: 60000
  }
};

const token = jwt.sign(payload, MAAX_COB_TOKEN_SECRET, {
  expiresIn: '30d'
});
```

---

## 🛡️ Validação no MAAX COB

O middleware `validateJwtToken` no MAAX COB:

1. **Extrai o Bearer token** do header `Authorization`
2. **Valida a assinatura JWT** usando `MCP_TOKEN_SECRET`
3. **Verifica expiração** do token
4. **Decodifica payload** e injeta em `req.mcpAuth`:

```typescript
req.mcpAuth = {
  company: "123",
  provider: "banco_do_brasil",
  apiKey: "mcp_key_abc123",
  meta: { timeoutMs: 60000 }
};
```

5. **Permite a requisição** se válido, ou retorna **401 Unauthorized**

---

## 🔄 Diferença entre API Key e JWT

### ❌ **Abordagem Anterior (INCORRETA)**

```http
GET /mcp HTTP/1.1
Host: localhost:3001
X-API-Key: mcp_key_abc123
```

**Problemas:**
- API Key exposta em todas as requisições
- Sem informações contextuais (company, provider)
- Validação simples por lista de keys

### ✅ **Abordagem Atual (CORRETA)**

```http
GET /mcp HTTP/1.1
Host: localhost:3001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Vantagens:**
- Token assinado criptograficamente
- Payload contém contexto completo (company, provider, credentials)
- Expiração automática (30 dias)
- Padrão seguido por Codex CIGAM e outros MCPs oficiais

---

## 🧪 Testando a Autenticação

### 1. Gerar um token manualmente

```typescript
import jwt from 'jsonwebtoken';

const token = jwt.sign(
  {
    company: '123',
    provider: 'banco_do_brasil',
    credentials: { apiKey: 'mcp_key_abc' },
    meta: { timeoutMs: 60000 }
  },
  'your_secret_here',
  { expiresIn: '30d' }
);

console.log(token);
```

### 2. Testar com curl

```bash
# Health check (público)
curl http://localhost:3001/health

# Endpoint MCP (requer JWT)
curl -H "Authorization: Bearer SEU_TOKEN_AQUI" \
     http://localhost:3001/mcp
```

### 3. Resposta de sucesso (200 OK)

```json
{
  "status": "ok",
  "transport": "http/sse",
  "mcp_version": "2.0.0"
}
```

### 4. Resposta de erro (401 Unauthorized)

```json
{
  "error": "Invalid or missing Bearer token",
  "code": "UNAUTHORIZED"
}
```

---

## 🔍 Logs de Debug

O MAAX COB emite logs úteis:

```
[MCP] Iniciando com transporte: http
[MCP] HTTP/SSE server rodando em http://localhost:3001
[MCP] SSE endpoint: http://localhost:3001/mcp
[MCP] Conexão SSE recebida em: /mcp
[MCP] JWT verification failed: jwt expired   # ❌ Token expirado
[MCP] JWT verification failed: invalid signature  # ❌ Secret incorreto
```

---

## 📝 Resumo

| Aspecto | Detalhes |
|---------|----------|
| **Método** | JWT Bearer Token |
| **Header** | `Authorization: Bearer <token>` |
| **Secret** | `MCP_TOKEN_SECRET` (igual em ambos servidores) |
| **Expiração** | 30 dias (configurável) |
| **Payload** | company, provider, credentials.apiKey, meta |
| **Validação** | Middleware `validateJwtToken` em todas rotas `/mcp` |
| **Padrão** | Mesmo fluxo do Codex CIGAM |

---

## 🚀 Próximos Passos

1. ✅ Configurar `MCP_TOKEN_SECRET` em ambos servidores
2. ✅ Frontend envia apenas `apiKey` ao backend
3. ✅ Backend gera JWT e envia para MAAX COB
4. ✅ MAAX COB valida JWT e extrai credenciais
5. 🔄 Implementar renovação automática de tokens expirados (futuro)

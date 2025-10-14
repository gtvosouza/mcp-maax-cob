# 🔒 Relatório de Auditoria de Segurança - MCP MAAX COB

**Data**: 2025-10-14
**Auditor**: Claude Code
**Escopo**: Isolamento de dados por company/tenant

---

## 🎯 Objetivo

Garantir que **NUNCA** uma company possa acessar dados (credenciais, cobranças, extratos) de outra company.

---

## ✅ Pontos Positivos Encontrados

### 1. **Derivação de SessionId (session-store.ts:34-47)**
```typescript
export function deriveSessionId(
  providerId: string,
  credentials: unknown,
  tenantId?: string
): string {
  const fingerprintPayload = {
    providerId,
    tenantId: tenantId ?? null,  // ✅ INCLUI tenantId
    credentials: sortValue(credentials)
  };

  const serialized = JSON.stringify(fingerprintPayload);
  return crypto.createHash("sha256").update(serialized).digest("hex");
}
```

**✅ BOM**: SessionId é único por combinação de `providerId + tenantId + credentials`

### 2. **Token JWT com Payload Estruturado (token.ts:30-40)**
```typescript
export type TokenPayload = {
  providerId: K;
  credentials: ProviderCredentialsMap[K];
  tenantId?: string;  // ✅ CAMPO EXISTE
  meta?: TokenMeta;
  context?: Record<string, unknown>;
};
```

**✅ BOM**: O token JWT suporta `tenantId` no payload

### 3. **Cache de Sessão Isolado (session-store.ts:49-55)**
```typescript
function buildRedisKey(sessionId: string, prefix?: string) {
  if (prefix) {
    return `${SESSION_KEY_PREFIX}:${prefix}:${sessionId}`;
  }
  return `${SESSION_KEY_PREFIX}:${sessionId}`;
}
```

**✅ BOM**: Redis keys incluem o sessionId (que já tem tenantId hash)

### 4. **Credenciais Criptografadas (initialize.ts:78)**
```typescript
credentialsEncrypted: encryptJson(payload.credentials),
```

**✅ BOM**: Credenciais são criptografadas antes de serem armazenadas

---

## ⚠️ VULNERABILIDADES CRÍTICAS ENCONTRADAS

### 🚨 CRÍTICO 1: Falta de Validação de TenantId no Transport HTTP

**Arquivo**: `src/mcp/transports.ts:119-136`

```typescript
const decoded = jwt.verify(token, tokenSecret) as any;

// Adicionar dados decodificados ao request para uso posterior
req.mcpAuth = {
  company: decoded.company,  // ⚠️ Campo 'company' não está no TokenPayload!
  provider: decoded.provider,
  apiKey: decoded.credentials?.apiKey,
  meta: decoded.meta
};
```

**PROBLEMA**:
1. O código está lendo `decoded.company` mas o tipo `TokenPayload` não tem campo `company`
2. O campo correto é `tenantId` (conforme definido em `token.ts`)
3. Isso pode causar `req.mcpAuth.company = undefined` silenciosamente

**IMPACTO**: 🔴 ALTO
- Requests podem ser processados sem validação de company
- Uma company pode potencialmente acessar dados de outra

---

### 🚨 CRÍTICO 2: Transport HTTP Não Passa TenantId para Handlers

**Arquivo**: `src/mcp/transports.ts:200-223`

```typescript
const decoded = jwt.verify(token, tokenSecret) as any;
credentials = decoded.credentials;

// Set provider and credentials context
if (this.mcpChargeServer) {
  if (decoded.provider) {
    this.mcpChargeServer.setProviderContext(decoded.provider);
  }
  if (credentials) {
    this.mcpChargeServer.setCredentialsContext(credentials);
  }
}
```

**PROBLEMA**:
- Passa apenas `provider` e `credentials`
- **NÃO passa `tenantId`** para o contexto do servidor MCP
- Handlers podem executar sem saber qual é a company

**IMPACTO**: 🔴 ALTO

---

### 🚨 CRÍTICO 3: Validação de TenantId nas Rotas REST

**Arquivo**: `src/routes/charges.ts` e `src/routes/initialize.ts`

**BOM**: As rotas REST usam corretamente `payload.tenantId` ao chamar `deriveSessionId()`

```typescript
const sessionId = deriveSessionId(
  payload.providerId,
  payload.credentials,
  payload.tenantId  // ✅ Passa tenantId
);
```

**PORÉM**: Precisamos garantir que:
1. O `tenantId` NUNCA seja opcional em produção
2. Toda request seja validada antes de processar

---

## 🔧 CORREÇÕES NECESSÁRIAS

### Correção 1: Padronizar Campo de Identificação

**Decisão**: Usar `tenantId` (não `company`) em todo o código

**Ações**:
1. Remover referências a `decoded.company` em `transports.ts`
2. Usar `decoded.tenantId` consistentemente
3. Validar que `tenantId` não é `undefined` antes de processar

### Correção 2: Adicionar Contexto de TenantId no MCP Server

**Arquivo**: `src/mcp/transports.ts`

Adicionar método para passar tenantId:
```typescript
if (this.mcpChargeServer) {
  if (decoded.tenantId) {
    this.mcpChargeServer.setTenantContext(decoded.tenantId);  // NOVO
  }
  if (decoded.providerId) {
    this.mcpChargeServer.setProviderContext(decoded.providerId);
  }
  if (credentials) {
    this.mcpChargeServer.setCredentialsContext(credentials);
  }
}
```

### Correção 3: Validação Obrigatória de TenantId

**Arquivo**: `src/security/token.ts`

Tornar `tenantId` obrigatório em produção:
```typescript
const basePayloadSchema = z.object({
  providerId: providerIdSchema,
  credentials: z.unknown(),
  tenantId: z.string().min(1),  // REMOVER .optional()
  meta: tokenMetaSchema,
  context: z.record(z.unknown()).optional(),
});
```

### Correção 4: Middleware de Validação de Tenant

Criar middleware que valida tenantId em TODAS as rotas:

```typescript
// src/middleware/tenant-validation.ts
export async function validateTenant(request, reply) {
  const token = extractBearerToken(request.headers.authorization);
  const payload = verifyInitializeToken(token, secret);

  if (!payload.tenantId) {
    return reply.status(403).send({
      error_code: "TENANT_REQUIRED",
      message: "TenantId is required for all operations"
    });
  }

  request.tenantId = payload.tenantId;
}
```

---

## 📋 Checklist de Implementação

- [ ] Corrigir campo `company` → `tenantId` em transports.ts
- [ ] Adicionar `setTenantContext()` no MCPChargeServer
- [ ] Tornar `tenantId` obrigatório no schema de token (produção)
- [ ] Criar middleware de validação de tenant
- [ ] Adicionar logs de auditoria incluindo tenantId
- [ ] Criar testes de isolamento entre tenants
- [ ] Documentar política de multi-tenancy

---

## 🧪 Testes de Segurança Recomendados

### Teste 1: Isolamento de Cache
```bash
# Company A cria sessão
curl -H "Authorization: Bearer <token-company-a>" POST /initialize

# Company B tenta acessar com mesmo providerId mas tenantId diferente
curl -H "Authorization: Bearer <token-company-b>" POST /initialize

# Verificar que sessionIds são diferentes
```

### Teste 2: Tentativa de Cross-Tenant Access
```bash
# Company A cria cobrança
charge_id=$(curl -H "Authorization: Bearer <token-company-a>" POST /charges | jq -r .charge_id)

# Company B tenta consultar cobrança de Company A
curl -H "Authorization: Bearer <token-company-b>" GET /charges/$charge_id

# Deve retornar 404 ou 403
```

---

## 🎯 Recomendações Adicionais

1. **Logging**: Incluir `tenantId` em TODOS os logs
2. **Métricas**: Separar métricas por tenant
3. **Rate Limiting**: Aplicar rate limit por tenant (não global)
4. **Alertas**: Criar alertas para tentativas de acesso cross-tenant
5. **Auditoria**: Gravar log de auditoria com tenantId em todas as operações sensíveis

---

## 📊 Níveis de Risco

| Vulnerabilidade | Risco | Probabilidade | Impacto |
|-----------------|-------|---------------|---------|
| Campo company vs tenantId | 🔴 Alto | Médio | Alto |
| Falta de tenantId em handlers | 🔴 Alto | Alto | Crítico |
| TenantId opcional | 🟡 Médio | Baixo | Alto |

---

## ✅ Conclusão

O sistema tem uma **boa base de segurança** com:
- Hash criptográfico de sessionId incluindo tenantId
- Credenciais criptografadas
- Cache isolado por sessão

**PORÉM**, existem **vulnerabilidades críticas** que precisam ser corrigidas:
1. Inconsistência entre `company` e `tenantId`
2. Falta de propagação de tenantId nos handlers MCP
3. Validação não obrigatória de tenantId

**Status**: 🟡 REQUER CORREÇÃO URGENTE antes de produção

---

**Próximos Passos**: Implementar as 4 correções listadas acima.

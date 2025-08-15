# MCP Server (MVP) — Pagamentos

Este projeto implementa um MVP do **MCP (Modelo de Protocolo de Contexto)** descrito no seu documento, com foco em **REST HTTP**,
**webhooks** e **multi-tenant**. Inclui **Docker**, **OpenAPI**, exemplos de payloads e um **adapter mock** para rodar end-to-end.

> **Objetivo**: ser a **melhor documentação** para um **MCP client** integrar rápido e com segurança.

---

## Sumário
1. [Arquitetura](#arquitetura)
2. [Subir com Docker](#subir-com-docker)
3. [Autenticação](#autenticação)
4. [Fluxos essenciais](#fluxos-essenciais)
5. [Exemplos de requisição](#exemplos-de-requisição)
6. [Webhooks](#webhooks)
7. [Idempotência](#idempotência)
8. [Paginação](#paginação)
9. [Rate limit](#rate-limit)
10. [Códigos de erro](#códigos-de-erro)
11. [OpenAPI](#openapi)
12. [Estrutura do projeto](#estrutura-do-projeto)

---

## Arquitetura

- **API**: Fastify + TypeScript (HTTP/JSON).
- **DB**: PostgreSQL (UUID + JSON), via SQL simples (você pode trocar por Drizzle/Prisma).
- **Cache/Idempotência**: Redis.
- **Mensageria**: RabbitMQ (reservado p/ processamento de webhooks/retries—MVP usa HTTP direto).
- **Adapters**: porta única (`PaymentProvider`) com implementação **mock** (simula um provedor).

```txt
Tenant → (Admin API Key) → [ Initialize Provider / API Key ] → (Public API Key) → Charges
                                                       ↓
                                                  Adapters (mock / bb / sicredi / ...)
                                                       ↓
                                                Webhooks assinados (HMAC)
```

---

## Subir com Docker

1) Copie `.env.example` para `.env` e ajuste os segredos (recomendado trocar `ENCRYPTION_KEY_HEX` e `WEBHOOK_HMAC_SECRET`).  
2) Rode:

```bash
docker compose up --build
```

API em `http://localhost:3000`.

---

## Autenticação

- **Admin API Key**: Header `X-Admin-Api-Key`. Usada para operações administrativas (tenant/provider/api-keys/webhooks).
- **Public API Key**: Header `X-Public-Api-Key`. Usada para operações de **charges**.

Chaves são retornadas **apenas uma vez** na criação e devem ser guardadas pelo cliente.

---

## Fluxos essenciais

### 1) Initialize Tenant
`POST /v1/tenants/init` → retorna `tenant_id` + `admin_api_key`.

### 2) Initialize Provider
`POST /v1/admin/providers` (header `X-Admin-Api-Key`) com:
```json
{
  "provider_type": "mock",
  "friendly_name": "Conta Mock",
  "credentials": { "token": "xyz" },
  "provider_specific_config": { "carteira": "123", "convenio": "0001" }
}
```
→ retorna `provider_id`.

### 3) Criar Public API Key
`POST /v1/admin/api-keys` (header `X-Admin-Api-Key`) → retorna `api_key` (prefixo `pk_...`).

### 4) Criar cobrança (Charge)
`POST /v1/charges` (header `X-Public-Api-Key`) indicando `provider_id` do passo 2.

---

## Exemplos de requisição

### CreateCharge
```bash
curl -X POST http://localhost:3000/v1/charges   -H "Content-Type: application/json"   -H "X-Public-Api-Key: pk_test_123"   -d '{
    "provider_id": "f6d1a4b0-0000-0000-0000-000000000000",
    "amount": 12990,
    "due_date": "2025-09-10",
    "reference_id": "PED-2025-0001",
    "payment_methods": ["boleto", "pix"],
    "customer": {
      "name": "Cliente Exemplo",
      "document": "12345678901",
      "address": {"zip_code":"90000000","city":"Porto Alegre","state":"RS","street":"Rua X, 123"}
    }
  }'
```

**Resposta** (exemplo):
```json
{
  "id": "1b2c3d4e-...",
  "provider_charge_id": "mock-99123",
  "status": "PENDING",
  "amount": 12990,
  "due_date": "2025-09-10",
  "payment_methods": ["boleto", "pix"],
  "data": {
    "digitable_line": "34191...",
    "qr_code_text": "00020126..."
  }
}
```

### RetrieveCharge
```bash
curl -H "X-Public-Api-Key: pk_test_123" http://localhost:3000/v1/charges/1b2c3d4e-...
```

### ListCharges (cursor)
```bash
curl -H "X-Public-Api-Key: pk_test_123" "http://localhost:3000/v1/charges?limit=20&starting_after=cursorXYZ"
```

### ApplyInstruction
```bash
curl -X POST http://localhost:3000/v1/charges/1b2c3d4e-.../instructions   -H "Content-Type: application/json"   -H "X-Public-Api-Key: pk_test_123"   -d '{"instruction_type":"change_due_date","parameters":{"new_due_date":"2025-10-05"}}'
```

---

## Webhooks

- Registre via `POST /v1/admin/webhooks` (admin key), passando `url` e `enabled_events`.
- Eventos enviados com **`X-MCP-Signature: sha256=<hex>`** onde `<hex>` = HMAC_SHA256(body, `WEBHOOK_HMAC_SECRET`).

**Verificação (Node):**
```js
import crypto from "node:crypto";
const ok = crypto.timingSafeEqual(
  Buffer.from(sigHeader.split("sha256=")[1], "hex"),
  crypto.createHmac("sha256", process.env.WEBHOOK_HMAC_SECRET).update(rawBody).digest()
);
```

Eventos (MVP):
- `charge.created`
- `charge.paid`
- `charge.canceled`

> Dica: Recomendamos retry exponencial (até 24h) quando a URL retornar 5xx/timeout.

---

## Idempotência

Envie `reference_id` em `CreateCharge`. O servidor garante idempotência por (`tenant_id`, `reference_id`).  
Recomendado também usar cache Redis (`SETNX`) e índice único no banco.

---

## Paginação

Listagens usam **cursor**. Resposta inclui `next_cursor`; passe em `starting_after` para a próxima página.

---

## Rate limit

Header `X-RateLimit-Remaining` indica saldo do minuto corrente.  
HTTP 429 quando excedido. Recomenda-se *backoff* exponencial.

---

## Códigos de erro

Formato padronizado:
```json
{
  "error_code": "PROVIDER_UNAVAILABLE",
  "message": "Sicredi API is down",
  "details": ["timeout 10s"],
  "trace_id": "req-abc123"
}
```
Erros comuns:
- `AUTH_INVALID_KEY`
- `TENANT_NOT_FOUND`
- `PROVIDER_NOT_FOUND`
- `IDEMPOTENCY_CONFLICT`
- `PROVIDER_UNAVAILABLE`
- `VALIDATION_ERROR`
- `INTERNAL_ERROR`

---

## OpenAPI

O contrato está em [`openapi.yaml`](./openapi.yaml).  
Você pode abrir no Swagger Editor ou ReDoc para visualizar.

---

## Estrutura do projeto

```txt
.
├── openapi.yaml
├── docker-compose.yml
├── Dockerfile
├── .env.example
├── README.md
├── CLAUDE.md
└── src
    ├── server.ts
    ├── env.ts
    ├── api
    │   ├── auth.ts
    │   ├── routes
    │   │   ├── tenants.ts
    │   │   ├── providers.ts
    │   │   ├── apiKeys.ts
    │   │   ├── charges.ts
    │   │   └── webhooks.ts
    │   └── schemas.ts
    ├── core
    │   └── types.ts
    ├── adapters
    │   ├── index.ts
    │   └── mock.ts
    └── infra
        ├── db.ts
        ├── crypto.ts
        ├── idempotency.ts
        └── redis.ts
```

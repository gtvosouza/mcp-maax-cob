# 🔐 Banco do Brasil - mTLS Setup Guide

## 🎯 Descoberta Importante

A API de Extratos do BB **REQUER mTLS** (Mutual TLS Authentication):
- **URL:** `https://api-extratos.bb.com.br/extratos/v1`
- **Erro sem certificado:** `SSL routines::sslv3 alert bad certificate`
- **Solução:** Configurar certificados digitais cliente

---

## 📋 O que você precisa fazer

### 1. Obter Certificados do BB

No Portal do Desenvolvedor BB (https://developers.bb.com.br):

1. Acesse sua aplicação (Software ID: 132422)
2. Vá em **"Certificados"** ou **"Segurança"**
3. Gere ou faça download dos certificados:
   - **Certificado Cliente** (.crt ou .pem)
   - **Chave Privada** (.key ou .pem)
   - **Certificado CA do BB** (opcional, para validação)

### 2. Formato dos Certificados

Os certificados podem estar em diferentes formatos:

#### Formato .p12 / .pfx (PKCS#12)
```bash
# Se você recebeu um arquivo .p12, extraia o certificado e a chave:

# Extrair certificado
openssl pkcs12 -in certificado.p12 -clcerts -nokeys -out client-cert.pem

# Extrair chave privada
openssl pkcs12 -in certificado.p12 -nocerts -nodes -out client-key.pem
```

#### Formato .pem (já separados)
Se você já tem `client-cert.pem` e `client-key.pem`, está pronto!

---

## 🔧 Configuração no Node.js

### Opção 1: Usando `https` com certificados

```javascript
import https from 'https';
import fs from 'fs';

const httpsAgent = new https.Agent({
  cert: fs.readFileSync('./certs/client-cert.pem'),
  key: fs.readFileSync('./certs/client-key.pem'),
  // ca: fs.readFileSync('./certs/bb-ca.pem'), // Opcional
  rejectUnauthorized: true // Validar certificado do servidor
});

// Usar com fetch (Node 18+)
const response = await fetch(url, {
  agent: httpsAgent,
  headers: { ... }
});
```

### Opção 2: Usando variáveis de ambiente

```bash
# .env
BB_CLIENT_CERT_PATH=./certs/client-cert.pem
BB_CLIENT_KEY_PATH=./certs/client-key.pem
BB_CLIENT_KEY_PASSPHRASE=senha_se_necessario
```

```javascript
import https from 'https';
import fs from 'fs';

const agent = new https.Agent({
  cert: fs.readFileSync(process.env.BB_CLIENT_CERT_PATH),
  key: fs.readFileSync(process.env.BB_CLIENT_KEY_PATH),
  passphrase: process.env.BB_CLIENT_KEY_PASSPHRASE // Se a chave for protegida
});
```

---

## 📁 Estrutura de Arquivos Recomendada

```
mcp-maax-cob/
├── certs/
│   ├── bb-client-cert.pem     # Certificado cliente
│   ├── bb-client-key.pem      # Chave privada
│   ├── bb-ca.pem              # CA do BB (opcional)
│   └── .gitignore             # IMPORTANTE: não commitar certificados!
├── .env
└── src/
    └── adapters/
        └── bancoBrasil.ts     # Atualizar com mTLS
```

### .gitignore para certificados
```gitignore
# Certificados e chaves privadas
certs/*.pem
certs/*.p12
certs/*.pfx
certs/*.key
*.pem
*.p12
*.pfx
*.key
```

---

## 🚀 Atualização do Adapter BB

Vou atualizar o [bancoBrasil.ts](src/adapters/bancoBrasil.ts:1) para suportar mTLS:

### Configuração necessária

```typescript
interface BancoBrasilCredentials {
  client_id: string;
  client_secret: string;
  developer_application_key: string;
  account_number: string;
  account_type: string;
  sandbox?: boolean;

  // Novos campos para mTLS
  cert_path?: string;  // Caminho para certificado cliente
  key_path?: string;   // Caminho para chave privada
  key_passphrase?: string;  // Senha da chave (se necessário)
  ca_path?: string;    // Caminho para CA do BB (opcional)
}
```

### Exemplo de uso

```typescript
const adapter = new BancoBrasilAdapter(
  encryptedCredentials,  // Incluindo cert_path e key_path
  encryptedConfig
);

// O adapter automaticamente usará mTLS se cert_path estiver presente
const statement = await adapter.getAccountStatement({
  agency: "4733",
  account: "15032",
  query: {
    start_date: "13092025",
    end_date: "13102025"
  }
});
```

---

## 🧪 Teste com Certificados

Depois de configurar os certificados:

```bash
# Teste básico com curl
curl --cert ./certs/client-cert.pem \
     --key ./certs/client-key.pem \
     -H "Authorization: Bearer $TOKEN" \
     -H "gw-dev-app-key: $APP_KEY" \
     "https://api-extratos.bb.com.br/extratos/v1/conta-corrente/agencia/4733/conta/15032?..."
```

```bash
# Teste com Node.js
node test-bb-extrato-mtls.mjs
```

---

## ⚠️ Segurança

### ✅ Boas Práticas

1. **NUNCA commitar certificados no git**
2. **Usar permissões restritas nos arquivos:**
   ```bash
   chmod 600 certs/*.pem
   chmod 600 certs/*.key
   ```
3. **Criptografar credenciais em produção** (já implementado no sistema)
4. **Usar variáveis de ambiente** para caminhos
5. **Renovar certificados antes do vencimento**

### ❌ Não Fazer

- ❌ Compartilhar certificados por email não seguro
- ❌ Usar certificados de homologação em produção
- ❌ Deixar chaves privadas sem proteção de senha
- ❌ Commitar certificados no repositório

---

## 📞 Onde Obter os Certificados

### Portal do Desenvolvedor BB
1. Acesse: https://developers.bb.com.br
2. Login com suas credenciais
3. Selecione sua aplicação (Software ID: 132422)
4. Vá para: **Configurações → Certificados → Gerar/Baixar**

### Tipos de Certificado

O BB pode usar diferentes tipos:
- **e-CPF / e-CNPJ** (certificado ICP-Brasil)
- **Certificado de API** (gerado pelo BB)
- **Open Banking Brasil** (certificado específico para Open Banking)

Verifique na documentação qual tipo sua aplicação requer.

---

## 🎯 Próximos Passos

1. **Obter certificados** no portal BB
2. **Salvar em** `./certs/` (não commitar!)
3. **Testar conexão** com curl
4. **Atualizar credenciais** no sistema
5. **Rodar teste** completo

---

## 📊 Status Atual

| Item | Status | Observação |
|------|--------|------------|
| OAuth2 | ✅ Funcionando | oauth.bb.com.br |
| Scope | ✅ Autorizado | extrato-info |
| Endpoint | ✅ Identificado | api-extratos.bb.com.br |
| Formato URL | ✅ Correto | /conta-corrente/agencia/{x}/conta/{y} |
| Formato Data | ✅ Correto | DDMMAAAA sem zeros à esquerda |
| **mTLS** | ⏳ **PENDENTE** | **Precisa certificados** |

---

## 💡 Alternativa: Ambiente de Homologação

Se você quiser testar **sem mTLS primeiro**, use o ambiente de homologação:

**URL Homologação (sem mTLS):**
```
https://api.hm.bb.com.br/extratos/v1
```

**Nota:** Requer dados de conta de homologação (não sua conta real).

---

## Conclusão

✅ Tudo está correto na nossa implementação!
⏳ Só falta configurar os **certificados mTLS**
🔐 Depois disso, a API de Extratos funcionará perfeitamente

**Próximo passo:** Obter os certificados no Portal do Desenvolvedor BB.

#!/usr/bin/env node

import Fastify from 'fastify';
import jwt from 'jsonwebtoken';

const app = Fastify({ logger: true });

// Providers metadata (standalone)
app.get('/v1/internal/providers/metadata', async () => {
  return {
    providers: [
      {
        id: "cora",
        name: "Banco Cora",
        description: "API de cobranças do Banco Cora com suporte a PIX e boleto",
        required_credentials: {
          client_id: { type: "string", description: "Client ID fornecido pelo Cora", required: true },
          client_secret: { type: "string", description: "Client Secret (obrigatório se não usar certificado)", required: false },
          account_id: { type: "string", description: "ID da conta Cora", required: true },
          cert: { type: "string", description: "Certificado PEM para mTLS (alternativa ao client_secret)", required: false },
          private_key: { type: "string", description: "Chave privada PEM para mTLS", required: false },
          sandbox: { type: "boolean", description: "Usar ambiente de testes", default: true }
        },
        supported_methods: ["boleto", "pix"],
        supports_cancellation: false,
        auth_methods: ["oauth2", "mtls"]
      },
      {
        id: "sicredi",
        name: "Sicredi",
        description: "Sistema de cobranças Sicredi para cooperativas",
        required_credentials: {
          cooperativa: { type: "string", description: "Código da cooperativa (4 dígitos)", required: true, example: "0532" },
          user: { type: "string", description: "Usuário fornecido pela cooperativa", required: true },
          password: { type: "string", description: "Senha do usuário", required: true },
          sandbox: { type: "boolean", description: "Usar ambiente de homologação", default: true }
        },
        supported_methods: ["boleto"],
        supports_cancellation: true,
        auth_methods: ["basic"]
      },
      {
        id: "itau",
        name: "Itaú",
        description: "API Itaú Cobrança com certificado digital",
        required_credentials: {
          client_id: { type: "string", description: "Client ID cadastrado no Itaú", required: true },
          cert: { type: "string", description: "Certificado digital (.p12 em base64)", required: true },
          cert_password: { type: "string", description: "Senha do certificado", required: true },
          sandbox: { type: "boolean", description: "Usar ambiente de testes", default: true }
        },
        supported_methods: ["boleto", "pix"],
        supports_cancellation: true,
        auth_methods: ["certificate"]
      }
    ]
  };
});

// Token generation (standalone)
app.post('/v1/internal/providers/:provider_id/generate-token', async (request, reply) => {
  const { provider_id } = request.params;
  const body = request.body || {};

  const { credentials = {}, expires_in = 3600 } = body;

  const now = Math.floor(Date.now() / 1000);
  const exp = now + expires_in;

  const payload = {
    provider_id,
    credentials,
    iat: now,
    exp: exp
  };

  const encryptionKey = process.env.ENCRYPTION_KEY_HEX || 'a2f68679d8b4f1262df9e56718ab70f832c6d000d325a92400134e3cebea6320';
  const token = jwt.sign(payload, encryptionKey, { algorithm: 'HS256' });

  return {
    auth_token: `${provider_id}_${token}`,
    provider_id,
    expires_at: new Date(exp * 1000).toISOString(),
    expires_in
  };
});

const start = async () => {
  try {
    await app.listen({ port: 4000, host: '0.0.0.0' });
    console.log('Test server running on http://localhost:4000');
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
};

start();
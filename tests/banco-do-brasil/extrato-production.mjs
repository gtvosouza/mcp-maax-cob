#!/usr/bin/env node
/**
 * Test script for Banco do Brasil Account Statement (Extrato)
 * Production Environment - Statement Scopes Only
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

// BB Production Credentials (Statement/Extrato scopes only)
const BB_CREDENTIALS = {
  client_id: "eyJpZCI6ImFiYzMyN2ItMjFkNi00NTk0LTg4ZiIsImNvZGlnb1B1YmxpY2Fkb3IiOjAsImNvZGlnb1NvZnR3YXJlIjoxMzI0MjIsInNlcXVlbmNpYWxJbnN0YWxhY2FvIjoxfQ",
  client_secret: "eyJpZCI6IjRiMzQ2YjctYzJlNi00ZTI2LSIsImNvZGlnb1B1YmxpY2Fkb3IiOjAsImNvZGlnb1NvZnR3YXJlIjoxMzI0MjIsInNlcXVlbmNpYWxJbnN0YWxhY2FvIjoxLCJzZXF1ZW5jaWFsQ3JlZGVuY2lhbCI6MSwiYW1iaWVudGUiOiJwcm9kdWNhbyIsImlhdCI6MTc2MDM1OTY4NzkyN30",
  developer_application_key: "f78739b2418443d3b73e77f47513069c",
  account_number: "PENDING", // TODO: Add account number
  account_type: "conta_corrente",
  sandbox: false // PRODUCTION
};

// Encryption helper (AES-256-GCM)
const ENCRYPTION_KEY_HEX = "a2f68679d8b4f1262df9e56718ab70f832c6d000d325a92400134e3cebea6320";

function encryptJson(obj) {
  const key = Buffer.from(ENCRYPTION_KEY_HEX, 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const plaintext = JSON.stringify(obj);
  let encrypted = cipher.update(plaintext, 'utf8', 'base64');
  encrypted += cipher.final('base64');

  const authTag = cipher.getAuthTag();

  return JSON.stringify({
    iv: iv.toString('base64'),
    data: encrypted,
    authTag: authTag.toString('base64')
  });
}

// Test 1: OAuth2 Token Generation with Statement Scopes
async function testOAuth2TokenExtrato() {
  console.log('\n🔐 Test 1: BB OAuth2 Token Generation (Extrato Scopes)\n');
  console.log('Environment: PRODUCTION');
  console.log('Base URL: https://api.bb.com.br');
  console.log('Client ID:', BB_CREDENTIALS.client_id.substring(0, 30) + '...');

  const credentials = Buffer.from(
    `${BB_CREDENTIALS.client_id}:${BB_CREDENTIALS.client_secret}`
  ).toString('base64');

  const scopes = ["extrato-info"];

  const params = new URLSearchParams();
  params.append('grant_type', 'client_credentials');
  params.append('scope', scopes.join(' '));

  try {
    console.log('\n📤 Requesting token with scopes:', scopes.join(', '));

    const response = await fetch('https://api.bb.com.br/oauth/token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString()
    });

    const responseText = await response.text();
    console.log('\n📥 Response Status:', response.status, response.statusText);

    if (!response.ok) {
      console.error('❌ Token generation failed!');
      console.error('Response:', responseText);
      return null;
    }

    const tokenData = JSON.parse(responseText);
    console.log('✅ Token generated successfully!');
    console.log('Token Type:', tokenData.token_type);
    console.log('Expires In:', tokenData.expires_in, 'seconds');
    console.log('Access Token:', tokenData.access_token.substring(0, 50) + '...');

    return tokenData.access_token;
  } catch (error) {
    console.error('❌ Error:', error.message);
    return null;
  }
}

// Test 2: Get Account Statement
async function testGetAccountStatement(accessToken, agencia, conta) {
  console.log('\n\n📊 Test 2: Get Account Statement\n');

  if (!agencia || !conta) {
    console.log('⚠️  Skipping - agencia and conta are required');
    console.log('\nUsage: node test-bb-extrato-production.mjs <agencia> <conta>');
    console.log('Example: node test-bb-extrato-production.mjs 0001 12345678');
    return;
  }

  // Get last 7 days
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const formatDateBB = (date) => {
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}.${month}.${year}`;
  };

  const dataInicio = formatDateBB(startDate);
  const dataFim = formatDateBB(endDate);

  console.log('📋 Statement Request:');
  console.log('  Agência:', agencia);
  console.log('  Conta:', conta);
  console.log('  Data Início:', dataInicio);
  console.log('  Data Fim:', dataFim);

  try {
    console.log('\n📤 Fetching account statement...');

    // Build URL with query parameters
    const baseUrl = 'https://api-extratos.bb.com.br/extratos/v1';
    const params = new URLSearchParams({
      'gw-dev-app-key': BB_CREDENTIALS.developer_application_key,
      'dataInicioSolicitacao': dataInicio,
      'dataFimSolicitacao': dataFim,
      'numeroPaginaSolicitacao': '1',
      'quantidadeRegistroPaginaSolicitacao': '10'
    });

    const url = `${baseUrl}/conta-corrente/agencia/${agencia}/conta/${conta}?${params.toString()}`;

    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
        'gw-dev-app-key': BB_CREDENTIALS.developer_application_key,
        'X-Developer-Application-Key': BB_CREDENTIALS.developer_application_key
      }
    });

    const responseText = await response.text();
    console.log('\n📥 Response Status:', response.status, response.statusText);

    if (!response.ok) {
      console.error('❌ Statement retrieval failed!');
      console.error('Response:', responseText);
      return;
    }

    const statementData = JSON.parse(responseText);
    console.log('✅ Statement retrieved successfully!\n');

    console.log('📄 Statement Summary:');
    console.log('  Current Page:', statementData.numeroPaginaAtual || 'N/A');
    console.log('  Total Pages:', statementData.quantidadeTotalPagina || 'N/A');
    console.log('  Total Records:', statementData.quantidadeTotalRegistro || 'N/A');
    console.log('  Records This Page:', statementData.quantidadeRegistroPaginaAtual || 'N/A');

    if (statementData.listaLancamento) {
      const entries = Array.isArray(statementData.listaLancamento)
        ? statementData.listaLancamento
        : [statementData.listaLancamento];

      console.log('\n📝 Transactions (' + entries.length + '):');
      entries.slice(0, 5).forEach((entry, index) => {
        console.log(`\n  [${index + 1}]`);
        console.log('    Data:', entry.dataLancamento || 'N/A');
        console.log('    Descrição:', entry.textoDescricaoLancamento || 'N/A');
        console.log('    Valor:', entry.valorLancamento || 'N/A');
        console.log('    Tipo:', entry.indicadorDebitoCredito || 'N/A');
      });

      if (entries.length > 5) {
        console.log(`\n  ... and ${entries.length - 5} more transactions`);
      }
    }

    return statementData;
  } catch (error) {
    console.error('❌ Error:', error.message);
  }
}

// Test 3: Generate encrypted credentials for .env
function testGenerateEncryptedCredentials() {
  console.log('\n\n🔐 Test 3: Generate Encrypted Credentials\n');

  console.log('⚠️  Make sure to update account_number before using!\n');

  const encryptedCredentials = encryptJson(BB_CREDENTIALS);

  console.log('Add this to your .env file:\n');
  console.log('# Banco do Brasil - Production (Extrato only)');
  console.log(`BB_EXTRATO_CREDENTIALS='${encryptedCredentials}'`);
}

// Main execution
async function main() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('  🏦 Banco do Brasil - Account Statement Test');
  console.log('  MCP MAAX COB - Production Environment');
  console.log('  Scope: extrato-info');
  console.log('═══════════════════════════════════════════════════════');

  // Get command line arguments
  const args = process.argv.slice(2);
  const agencia = args[0];
  const conta = args[1];

  // Test OAuth2 with extrato scope
  const accessToken = await testOAuth2TokenExtrato();

  if (!accessToken) {
    console.log('\n❌ Cannot continue without access token');
    return;
  }

  // Test Get Statement
  await testGetAccountStatement(accessToken, agencia, conta);

  // Generate encrypted credentials
  testGenerateEncryptedCredentials();

  console.log('\n═══════════════════════════════════════════════════════');
  console.log('  ✅ Test Suite Completed');
  console.log('═══════════════════════════════════════════════════════\n');

  if (!agencia || !conta) {
    console.log('💡 To test statement retrieval, run:');
    console.log('   node test-bb-extrato-production.mjs <agencia> <conta>');
    console.log('   Example: node test-bb-extrato-production.mjs 0001 12345678\n');
  }
}

main().catch(console.error);

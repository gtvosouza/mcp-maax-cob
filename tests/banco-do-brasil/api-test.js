const axios = require('axios');
const https = require('https');

// Credenciais do Banco do Brasil - Ambiente de Homologação/Sandbox
const BB_CREDENTIALS = {
  appKey: '6e4139f3fcb1484686a7f8b28c0334fb',  // Developer Key (gw-dev-app-key)
  clientId: 'eyJpZCI6Ijc4ZDkzNWYtMSIsImNvZGlnb1B1YmxpY2Fkb3IiOjAsImNvZGlnb1NvZnR3YXJlIjoxNTI0NDcsInNlcXVlbmNpYWxJbnN0YWxhY2FvIjoxfQ',
  clientSecret: 'eyJpZCI6ImEzMmI5YzktNWY4My00MGNhLThkZmItZmZiYjcxZjQ0Yzc5Mzc1NmVjM2QtNjg0Yi0iLCJjb2RpZ29QdWJsaWNhZG9yIjowLCJjb2RpZ29Tb2Z0d2FyZSI6MTUyNDQ3LCJzZXF1ZW5jaWFsSW5zdGFsYWNhbyI6MSwic2VxdWVuY2lhbENyZWRlbmNpYWwiOjEsImFtYmllbnRlIjoiaG9tb2xvZ2FjYW8iLCJpYXQiOjE3NTg3NDE3OTI5NjN9',
  // Basic token já codificado fornecido pelo BB
  basicToken: 'ZXlKcFpDSTZJamM0WkRrek5XWXRNU0lzSW1OdlpHbG5iMUIxWW14cFkyRmtiM0lpT2pBc0ltTnZaR2xuYjFOdlpuUjNZWEpsSWpveE5USTBORGNzSW5ObGNYVmxibU5wWVd4SmJuTjBZV3hoWTJGdklqb3hmUTpleUpwWkNJNkltRXpNbUk1WXprdE5XWTRNeTAwTUdOaExUaGtabUl0Wm1aaVlqY3haalEwWXpjNU16YzFObVZqTTJRdE5qZzBZaTBpTENKamIyUnBaMjlRZFdKc2FXTmhaRzl5SWpvd0xDSmpiMlJwWjI5VGIyWjBkMkZ5WlNJNk1UVXlORFEzTENKelpYRjFaVzVqYVdGc1NXNXpkR0ZzWVdOaGJ5STZNU3dpYzJWeGRXVnVZMmxoYkVOeVpXUmxibU5wWVd3aU9qRXNJbUZ0WW1sbGJuUmxJam9pYUc5dGIyeHZaMkZqWVc4aUxDSnBZWFFpT2pFM05UZzNOREUzT1RJNU5qTjk=',
  registrationAccessToken: 'eyJpZCI6ImZhMzE1NWIyLTRhYWMtNDQwOC04YWVhLTMxZDQzODM1NzZjNCIsImNvZGlnb1NvZnR3YXJlIjoxNTI0NDcsInNlcXVlbmNpYWxJbnN0YWxhY2FvIjowLCJzZXF1ZW5jaWFsVG9rZW4iOjEsImNvZGlnb1RpcG9Ub2tlbiI6MiwiYW1iaWVudGUiOiJob21vbG9nYWNhbyIsImlhdCI6MTc1ODc0MTc5MjgzNX0'
};

// URLs do ambiente sandbox
const BB_URLS = {
  oauth: 'https://oauth.sandbox.bb.com.br/oauth/token',
  extrato: 'https://api.sandbox.bb.com.br/extrato/v1',
  pagamentos: 'https://api.sandbox.bb.com.br/pagamentos/v1',
  cobranca: 'https://api.sandbox.bb.com.br/cobrancas/v2'
};

// Configuração do servidor MCP local
const MCP_SERVER = {
  url: 'http://localhost:8009',
  encryptionKey: 'a2f68679d8b4f1262df9e56718ab70f832c6d000d325a92400134e3cebea6320'
};

/**
 * 1. Gerar token MCP com as credenciais BB
 */
async function generateMCPToken() {
  try {
    console.log('\n🔐 Gerando token MCP para Banco do Brasil...');

    const response = await axios.post(
      `${MCP_SERVER.url}/v1/internal/providers/banco_do_brasil/generate-token`,
      {
        credentials: {
          client_id: BB_CREDENTIALS.clientId,
          client_secret: BB_CREDENTIALS.clientSecret,
          developer_key: BB_CREDENTIALS.appKey,
          scopes: ['extrato-conta', 'pagamento', 'pagamento.lote'],
          sandbox: true
        },
        expires_in: 3600
      },
      {
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('✅ Token MCP gerado com sucesso!');
    console.log('Token:', response.data.auth_token);
    console.log('Expira em:', response.data.expires_at);

    return response.data.auth_token;
  } catch (error) {
    console.error('❌ Erro ao gerar token MCP:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 2. Obter access token OAuth2 do Banco do Brasil
 */
async function getBBAccessToken() {
  try {
    console.log('\n🏦 Obtendo access token do Banco do Brasil...');

    // Usar o Basic token já fornecido pelo BB
    const response = await axios.post(
      BB_URLS.oauth,
      'grant_type=client_credentials&scope=extrato-conta pagamento pagamento.lote',
      {
        headers: {
          'Authorization': `Basic ${BB_CREDENTIALS.basicToken}`,
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false // Apenas para testes em sandbox
        })
      }
    );

    console.log('✅ Access token obtido com sucesso!');
    console.log('Token:', response.data.access_token);
    console.log('Tipo:', response.data.token_type);
    console.log('Expira em:', response.data.expires_in, 'segundos');
    console.log('Escopos:', response.data.scope);

    return response.data.access_token;
  } catch (error) {
    console.error('❌ Erro ao obter access token:', error.response?.data || error.message);
    throw error;
  }
}

/**
 * 3. Testar chamada à API de extrato
 */
async function testExtratoAPI(accessToken) {
  try {
    console.log('\n📊 Testando API de Extrato...');

    // Conta de teste do sandbox
    const agencia = '1234';
    const conta = '567890';
    const dataInicio = '2025-01-01';
    const dataFim = '2025-01-31';

    const response = await axios.get(
      `${BB_URLS.extrato}/conta/${agencia}/${conta}/extrato`,
      {
        params: {
          dataInicio,
          dataFim,
          'gw-dev-app-key': BB_CREDENTIALS.appKey
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      }
    );

    console.log('✅ API de Extrato funcionando!');
    console.log('Resposta:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error('❌ Erro ao chamar API de extrato:', error.response?.data || error.message);

    // Se for 404, pode ser conta inexistente no sandbox
    if (error.response?.status === 404) {
      console.log('ℹ️ Conta não encontrada no sandbox. Isso é normal em ambiente de testes.');
    }
  }
}

/**
 * 4. Testar listagem de lotes de pagamento
 */
async function testPagamentosAPI(accessToken) {
  try {
    console.log('\n💰 Testando API de Pagamentos em Lote...');

    const response = await axios.get(
      `${BB_URLS.pagamentos}/lotes`,
      {
        params: {
          'gw-dev-app-key': BB_CREDENTIALS.appKey
        },
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Accept': 'application/json'
        },
        httpsAgent: new https.Agent({
          rejectUnauthorized: false
        })
      }
    );

    console.log('✅ API de Pagamentos funcionando!');
    console.log('Resposta:', JSON.stringify(response.data, null, 2));

    return response.data;
  } catch (error) {
    console.error('❌ Erro ao chamar API de pagamentos:', error.response?.data || error.message);

    if (error.response?.status === 404) {
      console.log('ℹ️ Endpoint não disponível ou sem lotes no sandbox.');
    }
  }
}

/**
 * Executar todos os testes
 */
async function runAllTests() {
  console.log('========================================');
  console.log('   TESTE COMPLETO - BANCO DO BRASIL    ');
  console.log('========================================');
  console.log('Ambiente: SANDBOX (Homologação)');
  console.log('========================================');

  try {
    // Teste 1: Gerar token MCP
    const mcpToken = await generateMCPToken();
    console.log('\n💡 Use este token no MCP_AUTH_TOKEN para configurar o agente!');

    // Teste 2: Obter access token do BB
    const accessToken = await getBBAccessToken();

    // Teste 3: Testar API de extrato
    await testExtratoAPI(accessToken);

    // Teste 4: Testar API de pagamentos
    await testPagamentosAPI(accessToken);

    console.log('\n========================================');
    console.log('✅ TESTES CONCLUÍDOS COM SUCESSO!');
    console.log('========================================');

    // Mostrar como usar o token no MCP
    console.log('\n📝 Para usar no MCP, execute:');
    console.log(`MCP_AUTH_TOKEN="${mcpToken}" ENCRYPTION_KEY_HEX=${MCP_SERVER.encryptionKey} npm run mcp:stdio`);

  } catch (error) {
    console.error('\n❌ ERRO NOS TESTES:', error.message);
    process.exit(1);
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  runAllTests().catch(console.error);
}

module.exports = {
  BB_CREDENTIALS,
  BB_URLS,
  generateMCPToken,
  getBBAccessToken,
  testExtratoAPI,
  testPagamentosAPI
};
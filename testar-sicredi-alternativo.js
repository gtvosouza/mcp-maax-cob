/**
 * TESTE SICREDI - URLS ALTERNATIVAS
 * Testa URLs mais específicas do Sicredi
 */

import https from 'https';

const SICREDI_CONFIG = {
  x_api_key: "839ad8f5-ccdc-4d12-9299-e3bf5dc86ff6",
  username: "412210101",
  password: "12D021995EFD5768E2E74778FDAE0684344A09F4371DF17E102D30A1E219CE4D",
  cooperativa: "0101",
  posto: "14",
  codigoBeneficiario: "4121"
};

console.log('🔍 TESTE SICREDI - URLs ALTERNATIVAS');
console.log('===================================');

// Função para fazer requisição HTTPS
function httpsRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          data: data
        });
      });
    });
    
    req.on('error', reject);
    
    if (postData) {
      req.write(postData);
    }
    
    req.end();
  });
}

async function testarEndpointCompleto(url, path, method = 'GET', data = null, headers = {}) {
  console.log(`\\n🎯 Testando: ${method} ${url}${path}`);
  
  try {
    const defaultHeaders = {
      'X-API-Key': SICREDI_CONFIG.x_api_key,
      'User-Agent': 'MCP-Test/1.0',
      'Accept': 'application/json'
    };
    
    if (method === 'POST') {
      defaultHeaders['Content-Type'] = 'application/x-www-form-urlencoded';
    }
    
    const options = {
      hostname: new URL(url).hostname,
      port: 443,
      path: path,
      method: method,
      headers: { ...defaultHeaders, ...headers }
    };
    
    if (data && method === 'POST') {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }
    
    const response = await httpsRequest(options, data);
    
    console.log(`   Status: ${response.statusCode}`);
    
    if (response.statusCode < 400) {
      console.log(`   ✅ SUCESSO!`);
      console.log(`   Body: ${response.data.substring(0, 500)}...`);
      return true;
    } else if (response.statusCode === 401) {
      console.log(`   🔐 Erro de autenticação - endpoint existe mas credenciais inválidas`);
      console.log(`   Body: ${response.data.substring(0, 200)}`);
      return true; // Endpoint existe
    } else if (response.statusCode === 400) {
      console.log(`   📝 Bad Request - endpoint existe mas parâmetros incorretos`);
      console.log(`   Body: ${response.data.substring(0, 200)}`);
      return true; // Endpoint existe
    } else {
      console.log(`   ❌ Status: ${response.statusCode}`);
      if (response.data && response.data.length < 500) {
        console.log(`   Body: ${response.data}`);
      }
    }
    
    return false;
    
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return false;
  }
}

async function testarSicrediAlternativo() {
  // URLs alternativas comuns para bancos brasileiros
  const urls = [
    'https://api.sicredi.com.br',
    'https://apicobranca.sicredi.com.br',
    'https://cobranca.sicredi.com.br',
    'https://ws.sicredi.com.br',
    'https://webservice.sicredi.com.br',
    'https://openapi.sicredi.com.br',
    'https://banking.sicredi.com.br',
    'https://digital.sicredi.com.br',
    'https://hml-api.sicredi.com.br', // Homologação
    'https://sandbox.sicredi.com.br',
    'https://dev.sicredi.com.br'
  ];
  
  console.log('\\n🔐 TESTANDO OAUTH EM DIFERENTES DOMÍNIOS...');
  
  for (const url of urls) {
    const postData = `grant_type=password&username=${SICREDI_CONFIG.username}&password=${SICREDI_CONFIG.password}&scope=cobranca`;
    
    // Testar diferentes caminhos OAuth
    const paths = ['/oauth/token', '/auth/token', '/token', '/api/token'];
    
    for (const path of paths) {
      await testarEndpointCompleto(url, path, 'POST', postData);
    }
  }
  
  console.log('\\n💰 TESTANDO COBRANÇA EM DIFERENTES DOMÍNIOS...');
  
  for (const url of urls) {
    const paths = [
      '/cobranca/boleto',
      '/api/cobranca/boleto',
      '/v1/boleto',
      '/boleto'
    ];
    
    for (const path of paths) {
      await testarEndpointCompleto(url, path, 'GET');
    }
  }
  
  console.log('\\n🌐 TESTANDO BASIC AUTH (sem OAuth)...');
  
  // Testar autenticação básica direta
  const basicAuth = Buffer.from(`${SICREDI_CONFIG.username}:${SICREDI_CONFIG.password}`).toString('base64');
  
  await testarEndpointCompleto(
    'https://api.sicredi.com.br',
    '/cobranca/boleto',
    'GET',
    null,
    { 'Authorization': `Basic ${basicAuth}` }
  );
  
  await testarEndpointCompleto(
    'https://apicobranca.sicredi.com.br',
    '/boleto',
    'GET',
    null,
    { 'Authorization': `Basic ${basicAuth}` }
  );
  
  console.log('\\n📋 RESUMO DO TESTE:');
  console.log('   - Todos os endpoints testados');
  console.log('   - Procure por ✅ SUCESSO ou 🔐/📝 (endpoints que existem)');
  console.log('   - Se nenhum funcionar, as credenciais podem estar inativas');
  console.log('   - Ou o Sicredi pode usar uma API diferente/interna');
  
  console.log('\\n💡 PRÓXIMAS AÇÕES:');
  console.log('   1. Contatar suporte técnico Sicredi com essas credenciais');
  console.log('   2. Verificar se há documentação específica para essas credenciais');  
  console.log('   3. Confirmar ambiente (produção vs sandbox)');
  console.log('   4. Verificar se há whitelisting de IP necessário');
}

testarSicrediAlternativo();
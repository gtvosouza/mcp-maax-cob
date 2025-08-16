/**
 * DESCOBRIR ENDPOINTS SICREDI
 * Testa diferentes endpoints OAuth
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

console.log('🔍 DESCOBRINDO ENDPOINTS SICREDI');
console.log('=================================');

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

async function testarEndpoint(url, path, method = 'GET', data = null) {
  console.log(`\\n🎯 Testando: ${method} ${url}${path}`);
  
  try {
    const options = {
      hostname: new URL(url).hostname,
      port: 443,
      path: path,
      method: method,
      headers: {
        'X-API-Key': SICREDI_CONFIG.x_api_key,
        'Content-Type': method === 'POST' ? 'application/x-www-form-urlencoded' : 'application/json'
      }
    };
    
    if (data && method === 'POST') {
      options.headers['Content-Length'] = Buffer.byteLength(data);
    }
    
    const response = await httpsRequest(options, data);
    
    console.log(`   Status: ${response.statusCode}`);
    if (response.statusCode !== 404) {
      console.log(`   Body: ${response.data.substring(0, 200)}...`);
    }
    
    return response.statusCode !== 404;
    
  } catch (error) {
    console.log(`   ❌ Erro: ${error.message}`);
    return false;
  }
}

async function descobrirEndpoints() {
  const baseUrls = [
    'https://api.sicredi.com.br',
    'https://openbanking-api.sicredi.com.br',
    'https://developers.sicredi.com.br'
  ];
  
  const oauthPaths = [
    '/oauth/token',
    '/oauth/v1/token',
    '/oauth/v2/token',
    '/auth/oauth/token',
    '/auth/oauth/v1/token',
    '/auth/oauth/v2/token',
    '/auth/token',
    '/token',
    '/api/oauth/token',
    '/v1/oauth/token',
    '/v2/oauth/token'
  ];
  
  const cobrancaPaths = [
    '/cobranca/boleto/v1/boleto',
    '/cobranca/v1/boleto',
    '/boleto/v1/boleto',
    '/api/cobranca/v1/boleto',
    '/openbanking/payments/v1/pix/payments'
  ];
  
  console.log('\\n🔐 TESTANDO ENDPOINTS OAUTH...');
  
  for (const baseUrl of baseUrls) {
    console.log(`\\n📡 Base URL: ${baseUrl}`);
    
    for (const path of oauthPaths) {
      const postData = `grant_type=password&username=${SICREDI_CONFIG.username}&password=${SICREDI_CONFIG.password}&scope=cobranca`;
      const funcionou = await testarEndpoint(baseUrl, path, 'POST', postData);
      
      if (funcionou) {
        console.log(`   ✅ ENDPOINT OAUTH VÁLIDO: ${baseUrl}${path}`);
      }
    }
  }
  
  console.log('\\n💰 TESTANDO ENDPOINTS COBRANÇA...');
  
  for (const baseUrl of baseUrls) {
    console.log(`\\n📡 Base URL: ${baseUrl}`);
    
    for (const path of cobrancaPaths) {
      const funcionou = await testarEndpoint(baseUrl, path, 'GET');
      
      if (funcionou) {
        console.log(`   ✅ ENDPOINT COBRANÇA VÁLIDO: ${baseUrl}${path}`);
      }
    }
  }
  
  console.log('\\n💡 TENTATIVAS ESPECÍFICAS SICREDI...');
  
  // Tentar endpoint de documentação
  await testarEndpoint('https://developers.sicredi.com.br', '/docs', 'GET');
  await testarEndpoint('https://api.sicredi.com.br', '/docs', 'GET');
  await testarEndpoint('https://api.sicredi.com.br', '/swagger', 'GET');
  await testarEndpoint('https://api.sicredi.com.br', '/openapi', 'GET');
  
  // Tentar diferentes versões
  await testarEndpoint('https://api.sicredi.com.br', '/v1', 'GET');
  await testarEndpoint('https://api.sicredi.com.br', '/v2', 'GET');
  
  console.log('\\n🎉 TESTE DE DESCOBERTA CONCLUÍDO!');
  console.log('\\n💡 PRÓXIMOS PASSOS:');
  console.log('   1. Verifique a documentação oficial do Sicredi');
  console.log('   2. Contate o suporte técnico do Sicredi');
  console.log('   3. Confirme se as credenciais estão ativas');
  console.log('   4. Verifique se há ambiente sandbox separado');
}

descobrirEndpoints();
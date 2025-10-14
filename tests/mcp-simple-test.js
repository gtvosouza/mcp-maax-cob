// Teste simples do servidor MCP
const http = require('http');

const testEndpoints = [
  '/health',
  '/tools',
  '/mcp'
];

const host = 'localhost';
const port = 4004;

console.log(`🧪 Testando servidor MCP em ${host}:${port}`);
console.log('='.repeat(50));

async function testEndpoint(path) {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: port,
      path: path,
      method: 'GET',
      headers: {
        'Accept': 'application/json'
      }
    };

    const req = http.request(options, (res) => {
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        resolve({
          path,
          status: res.statusCode,
          headers: res.headers,
          body: data
        });
      });
    });

    req.on('error', (err) => {
      resolve({
        path,
        status: 'ERROR',
        error: err.message
      });
    });

    req.setTimeout(5000, () => {
      req.destroy();
      resolve({
        path,
        status: 'TIMEOUT',
        error: 'Request timed out'
      });
    });

    req.end();
  });
}

async function runTests() {
  for (const endpoint of testEndpoints) {
    console.log(`\nTestando ${endpoint}:`);
    
    const result = await testEndpoint(endpoint);
    
    if (result.status === 200) {
      console.log(`  ✅ Status: ${result.status}`);
      console.log(`  📄 Content-Type: ${result.headers['content-type']}`);
      
      try {
        const json = JSON.parse(result.body);
        console.log(`  📊 Response: ${JSON.stringify(json, null, 2)}`);
      } catch (e) {
        console.log(`  📄 Response: ${result.body.substring(0, 200)}...`);
      }
    } else {
      console.log(`  ❌ Status: ${result.status}`);
      if (result.error) {
        console.log(`  🚨 Error: ${result.error}`);
      }
    }
  }

  // Teste específico para SSE
  console.log(`\nTestando SSE connection:`);
  const sseResult = await testSSE();
  if (sseResult.success) {
    console.log(`  ✅ SSE endpoint accessible`);
  } else {
    console.log(`  ❌ SSE connection failed: ${sseResult.error}`);
  }
}

async function testSSE() {
  return new Promise((resolve) => {
    const options = {
      hostname: host,
      port: port,
      path: '/mcp',
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache'
      }
    };

    const req = http.request(options, (res) => {
      if (res.statusCode === 200) {
        resolve({ success: true });
      } else {
        resolve({ success: false, error: `HTTP ${res.statusCode}` });
      }
      res.destroy();
    });

    req.on('error', (err) => {
      resolve({ success: false, error: err.message });
    });

    req.setTimeout(3000, () => {
      req.destroy();
      resolve({ success: false, error: 'Timeout' });
    });

    req.end();
  });
}

// Executar testes
runTests().then(() => {
  console.log('\n' + '='.repeat(50));
  console.log('🎯 Teste concluído!');
  console.log('\nPara testar no navegador:');
  console.log(`  http://${host}:${port}/health`);
  console.log(`  http://${host}:${port}/tools`);
  console.log(`\nPara logs do container:`);
  console.log(`  docker logs mcp-maax-cob-mcp-1`);
}).catch(console.error);
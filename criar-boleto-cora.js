/**
 * CRIAR NOVO BOLETO - CORA PRODUÇÃO
 * Vencimento para amanhã com mesmas configurações
 */

import https from 'https';

// SUAS CREDENCIAIS
const CLIENT_ID = 'int-61h3KcplgZ2VtGzTCUP1wE';

const CERT = `-----BEGIN CERTIFICATE-----
MIIFpjCCBI6gAwIBAgIUR0DcIUbTmEt1dmgL45gjmhU9mb0wDQYJKoZIhvcNAQEL
BQAwgd4xCzAJBgNVBAYTAkJSMQswCQYDVQQIEwJTUDESMBAGA1UEBxMJU2FvIFBh
dWxvMUYwRAYDVQQJDD1Bdi4gQnJpZ2FkZWlybyBGYXJpYSBMaW1hLCAyOTU0IOKA
kyBDai4gNzIsIEphcmRpbSBQYXVsaXN0YW5vMRIwEAYDVQQREwkwMTQ1MS0wMTEx
ETAPBgNVBAoTCENvcmFCYW5rMQ8wDQYDVQQLEwZEZXZPcHMxLjAsBgNVBAMMJUNv
cmEgSW50ZWdyYcOnw6NvIERpcmV0YSBJbnRlcm1lZGlhdGUwHhcNMjUwNjI0MTQy
NjMwWhcNMjYwNjI0MTQyNzAwWjCB0zELMAkGA1UEBhMCQlIxCzAJBgNVBAgTAlNQ
MRIwEAYDVQQHEwlTYW8gUGF1bG8xRjBEBgNVBAkTPUF2ZW5pZGEgQnJpZ2FkZWly
byBGYXJpYSBMaW1hLCAyOTU0LCBjaiA3MiwgSmFyZGltIFBhdWxpc3Rhbm8xEjAQ
BgNVBBETCTAxNDUxLTAxMTERMA8GA1UEChMIQ29yYUJhbmsxDzANBgNVBAsTBkRl
dk9wczEjMCEGA1UEAxMaaW50LTYxaDNLY3BsZ1oyVnRHelRDVVAxd0UwggEiMA0G
CSqGSIb3DQEBAQUAA4IBDwAwggEKAoIBAQDAC/agf0PlsrvmddJVg7E02HjZtX2x
kSpSdcYVHHyGLSdWrBBFZ8jWI4z+wezabAlcAjCQfxaZ9vBeghTowOMO6KK1z/jX
p/F6pHbqKtvIB0J5wm39hlh6TPDDr5V6WpSEgyxPvZPEyMxsBrvCP++Y6ByWHDBi
hwc7gwoYkzNO/7kbcPVcsg8NVCktPvlE+fizXDaapdfBS9rhAf0o4I4pHatQ4g4P
apN/NPAf2J/y8R5LMT5R57QBScl9LlRQqQv4zLtnaEqVeJ90PzJSq5b2Rw01B0yT
2WMR2dOHzZnvzUiatPNL2535uBvKtbikjf90yrMaH4an1Ymy89Y/1TI1AgMBAAGj
ggFjMIIBXzAOBgNVHQ8BAf8EBAMCA6gwJwYDVR0lBCAwHgYIKwYBBQUHAwEGCCsG
AQUFBwMCBggrBgEFBQcDAzAdBgNVHQ4EFgQUPFdI6xHeLKFqS+uJIu5Adx189TIw
HwYDVR0jBBgwFoAUDY5BTl5UAPbBcNP0D1N9zHd43jowdwYIKwYBBQUHAQEEazBp
MCcGCCsGAQUFBzABhhtodHRwczovL29jc3AtaW50LmNvcmEubG9jYWwwPgYIKwYB
BQUHMAKGMmh0dHBzOi8vdmF1bHQuY29yYS5sb2NhbC92MS9jb3JhX2ludF9kaXJl
dGFfcGtpL2NhMCUGA1UdEQQeMByCGmludC02MWgzS2NwbGdaMlZ0R3pUQ1VQMXdF
MEQGA1UdHwQ9MDswOaA3oDWGM2h0dHBzOi8vdmF1bHQuY29yYS5sb2NhbC92MS9j
b3JhX2ludF9kaXJldGFfcGtpL2NybDANBgkqhkiG9w0BAQsFAAOCAQEAAAveLDYN
plnrksBdqhqL1vN0/zRLxjd9enB6nAsiGZ5s6uCzzQdTJwWesv3LhZ5wOwRxFbo0
hoUctHCbnVqg3l9Kt+bj0GQE74D+pZ/WB7jptcCx4RlQovRNujXTxtpsRUp+poAo
O4zma4TvJ3mnxhBHS8vLNRUDCYsgsnKCn2eX/qaqkiok6dOMPcopYFhBkTAuHrFq
HrrNoWEJ/OronYMeBpfNf9z1EU3vJq8A8sOjFZMVCNqeleCtTcAAv8fKjvF+KzvH
P6/J0J7SL9Duhs8dwOsG4TIhpRP9GFOrsoQajeEc4QuYMsQAEsbIBiABJ50TPssV
m2fL2JRIPUJY5A==
-----END CERTIFICATE-----`;

const PRIVATE_KEY = `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEAwAv2oH9D5bK75nXSVYOxNNh42bV9sZEqUnXGFRx8hi0nVqwQ
RWfI1iOM/sHs2mwJXAIwkH8WmfbwXoIU6MDjDuiitc/416fxeqR26irbyAdCecJt
/YZYekzww6+VelqUhIMsT72TxMjMbAa7wj/vmOgclhwwYocHO4MKGJMzTv+5G3D1
XLIPDVQpLT75RPn4s1w2mqXXwUva4QH9KOCOKR2rUOIOD2qTfzTwH9if8vEeSzE+
Uee0AUnJfS5UUKkL+My7Z2hKlXifdD8yUquW9kcNNQdMk9ljEdnTh82Z781ImrTz
S9ud+bgbyrW4pI3/dMqzGh+Gp9WJsvPWP9UyNQIDAQABAoIBAEeirsZDcpI1z30x
qdmYG/u4W6vp1Q7tNTo5EEBDtfde1HOyDwe0pOerryZANBdtgTg+4NqlbUrVH+hA
4YfIm2muQTNMdmgLDzpOKsVCY2UDwDom2lxdRpeoJ4726e0P6KJdQ6Qi9QHMXORW
xqa4rqj8u90Kesnl0D7UrGlqTxNCDa0L6c5AsP7YIpvAPeYUQOjIoqYP4wpXayj1
ijvpBlEUVsnvaWWDzvufnouFLr7XdGFgrmy1cJLLm3kVx/Bcl9Xf4QgqH32yLIYu
f0yeW00UjzwLorfaguH3n3HNh2oyb/XGuljxguIMzbp0gBwi45Nus5WNUuySFn9A
FYH4tYECgYEA+iYwWdaE/+6XsiRKB75KDWxrS385EJz90U1jkrB1BL2/Vck3QH+c
Ylek5KHEXptPyySusBIIGSUUpu1fWyhRq+df1Lj1iGj01NYHBRaPEqFyKkq6RA5g
chu5GAqjnX+qbKEPK1dXhtG9M7l4+fU+Gl+JmXtDuz7+VHWAJgTWliUCgYEAxIng
TCpEm65RN0LmeYis3y52UUPnf7hP6BqeBsLc/R0X690uERjJzznMd4gCbdPOR28X
WEMO8jc1N0oHzg2XEHReUIL6JRhJStAzzgg3KJ96V3aDP+cp9AkDoE85LcOpsiXF
B0XNNUyitpAtXa+YR9+CPyD5knask1P18/E0xtECgYBXJdbSdZoAT+8pcNsZt4G1
C4CV3MzUrN0AfiWihTc/X5u5F1DYd5zT5hTcUj9HdnRmIXF6hc2sdO6s+SWvbGyH
pyQLyCRCUc56F9Z6P1G4++X6Ne6OpzOSjXX+mjZGOKP3FGVkhBlKLufrjUJIUtg/
9+jIP9lo8plIc2ch162qwQKBgEd17lUjRUDp1+Pk8lIcTOb1SNXxf7njtUIqc2z3
60wpCOqcyEQ1JCOx21NW47M1QRqeHPndoBCX3ESXKVFVhajY9vYFOZjFRNjr7Por
6IpfuicVE1Hn5kwx/tyKEbs/GnOI4iPr0Fph3APPVn9q+k6fyQbVIYmMluEWtSYW
fN8RAoGBAMLwO6tKBkLgT2uCqkPUGbYLXJ4Q4iSHtV+F3lJvOzWjVXL/NbItbVfp
1O49eIiLQp5q+0U8sKR9aJuhUJVmpOpEO/x4be8c7kK2Yj04JzU4stlk836tdOaW
C/Evhl25KRBj8c4C5zUBIind4yfQETjs6cG+mPOobdTh6usitkjd
-----END RSA PRIVATE KEY-----`;

// Data de vencimento - AMANHÃ
const hoje = new Date();
const amanha = new Date(hoje);
amanha.setDate(hoje.getDate() + 1);
const dataVencimento = amanha.toISOString().split('T')[0]; // YYYY-MM-DD

console.log('📅 Data de hoje:', hoje.toISOString().split('T')[0]);
console.log('📅 Data de vencimento (amanhã):', dataVencimento);

// Função para fazer requisição HTTPS com certificado
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

async function obterTokenOAuth() {
  console.log('\n🔐 PASSO 1: Obtendo token OAuth2...');
  console.log('   URL: https://matls-clients.api.cora.com.br/token');
  console.log('   Client ID:', CLIENT_ID);
  
  const postData = `grant_type=client_credentials&client_id=${CLIENT_ID}`;
  
  const options = {
    hostname: 'matls-clients.api.cora.com.br',
    port: 443,
    path: '/token',
    method: 'POST',
    cert: CERT,
    key: PRIVATE_KEY,
    rejectUnauthorized: false,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const response = await httpsRequest(options, postData);
  
  console.log('   Status:', response.statusCode);
  
  if (response.statusCode === 200) {
    const tokenData = JSON.parse(response.data);
    console.log('   ✅ Token obtido com sucesso!');
    console.log('   Tipo:', tokenData.token_type);
    console.log('   Expira em:', tokenData.expires_in, 'segundos');
    return tokenData.access_token;
  } else {
    console.log('   ❌ Erro ao obter token:', response.data);
    throw new Error('Falha ao obter token OAuth');
  }
}

async function criarBoleto(accessToken) {
  console.log('\n📋 PASSO 2: Criando novo boleto...');
  
  // Dados do boleto - formato baseado nos exemplos da API
  const boletoData = {
    code: `BOLETO_${Date.now()}`, // Código único
    total_amount: 6000, // R$ 60,00 (em centavos)
    due_date: dataVencimento,
    customer: {
      name: "Teste Boleto Amanhã - MCP System",
      email: "teste@mcp.com",
      document: {
        identity: "12217888000106",
        type: "CNPJ"
      },
      address: {
        street: "AVENIDA ASSIS BRASIL",
        number: "6537",
        district: "SARANDI",
        city: "PORTO ALEGRE",
        state: "RS",
        complement: "TESTE MCP",
        zip_code: "91140001"
      }
    },
    services: [{
      name: "Teste MCP Integration",
      description: "Teste de criação de boleto via MCP",
      amount: 6000,
      unit: "AMOUNT"
    }],
    payment_terms: {
      due_date: dataVencimento
    }
  };
  
  console.log('   Valor:', boletoData.total_amount / 100, 'BRL');
  console.log('   Vencimento:', dataVencimento);
  console.log('   Cliente:', boletoData.customer.name);
  console.log('   Payload:', JSON.stringify(boletoData, null, 2));
  
  const options = {
    hostname: 'matls-clients.api.cora.com.br',
    port: 443,
    path: '/v2/invoices',
    method: 'POST',
    cert: CERT,
    key: PRIVATE_KEY,
    rejectUnauthorized: false,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `boleto_amanha_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    }
  };
  
  const response = await httpsRequest(options, JSON.stringify(boletoData));
  
  console.log('   Status:', response.statusCode);
  console.log('   Headers:', JSON.stringify(response.headers, null, 2));
  console.log('   Body:', response.data);
  
  if (response.statusCode === 201 || response.statusCode === 200) {
    const boleto = JSON.parse(response.data);
    console.log('\n✅ BOLETO CRIADO COM SUCESSO!');
    console.log('===============================');
    console.log('ID:', boleto.id);
    console.log('Status:', boleto.status);
    console.log('Valor:', boleto.total_amount / 100, 'BRL');
    console.log('Vencimento:', boleto.payment_terms?.due_date);
    console.log('Cliente:', boleto.customer?.name);
    
    if (boleto.payment_options?.bank_slip) {
      console.log('\n💳 DADOS DO BOLETO:');
      console.log('Linha Digitável:', boleto.payment_options.bank_slip.digitable);
      console.log('Código de Barras:', boleto.payment_options.bank_slip.barcode);
      console.log('Nosso Número:', boleto.payment_options.bank_slip.our_number);
      
      if (boleto.payment_options.bank_slip.url) {
        console.log('📄 URL do PDF:', boleto.payment_options.bank_slip.url);
        await baixarPDF(boleto.payment_options.bank_slip.url, boleto.id);
      }
    }
    
    if (boleto.pix) {
      console.log('\n📱 DADOS DO PIX:');
      console.log('QR Code:', boleto.pix.emv);
    }
    
    return boleto;
    
  } else {
    console.log('   ❌ Erro ao criar boleto:', response.data);
    throw new Error('Falha ao criar boleto');
  }
}

async function baixarPDF(pdfUrl, invoiceId) {
  console.log('\n🖨️ BAIXANDO PDF DO NOVO BOLETO...');
  console.log('URL:', pdfUrl);
  
  const url = new URL(pdfUrl);
  
  const options = {
    hostname: url.hostname,
    port: 443,
    path: url.pathname + url.search,
    method: 'GET',
    headers: {
      'Accept': 'application/pdf'
    }
  };
  
  const response = await httpsRequest(options);
  
  console.log('Status download:', response.statusCode);
  
  if (response.statusCode === 200) {
    const fs = await import('fs');
    const filename = `boleto_novo_${invoiceId}_${Date.now()}.pdf`;
    
    fs.writeFileSync(filename, response.data, 'binary');
    
    console.log('✅ PDF BAIXADO COM SUCESSO!');
    console.log('📁 Arquivo salvo como:', filename);
    console.log('📄 Tamanho:', Buffer.byteLength(response.data), 'bytes');
    
    return filename;
  } else {
    console.log('❌ Erro ao baixar PDF:', response.data);
  }
}

// Executar criação
async function criarBoletoCompleto() {
  console.log('🚀 CRIANDO NOVO BOLETO - CORA PRODUÇÃO');
  console.log('=====================================');
  
  try {
    // Passo 1: Obter token
    const accessToken = await obterTokenOAuth();
    
    // Passo 2: Criar boleto
    const boleto = await criarBoleto(accessToken);
    
    console.log('\n🎉 PROCESSO CONCLUÍDO COM SUCESSO!');
    console.log('Novo boleto ID:', boleto.id);
    console.log('Vencimento:', dataVencimento);
    
  } catch (error) {
    console.error('\n❌ Erro no processo:', error.message);
  }
}

// Executar
criarBoletoCompleto();
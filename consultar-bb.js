/**
 * CONSULTAR BOLETOS EXISTENTES - BANCO DO BRASIL
 * Usa os dados reais do histórico para testar consulta
 */

import https from 'https';

// Credenciais
const BB_CONFIG = {
  client_id: "eyJpZCI6IjNmYSIsImNvZGlnb1B1YmxpY2Fkb3IiOjAsImNvZGlnb1NvZnR3YXJlIjo2NDI4Nywic2VxdWVuY2lhbEluc3RhbGFjYW8iOjJ9",
  client_secret: "eyJpZCI6IjUxM2UyYWEtMmQxOS00IiwiY29kaWdvUHVibGljYWRvciI6MCwiY29kaWdvU29mdHdhcmUiOjY0Mjg3LCJzZXF1ZW5jaWFsSW5zdGFsYWNhbyI6Miwic2VxdWVuY2lhbENyZWRlbmNpYWwiOjEsImFtYmllbnRlIjoicHJvZHVjYW8iLCJpYXQiOjE3MDg2ODkyODk5MTl9",
  developer_key: "0e6e2b9fae67269252e5640a7087f7ca",
  convenio: "2851693",
  carteira: "17"
};

// Dados do boleto do histórico
const BOLETO_HISTORICO = {
  numero: "00028516930000101097",
  numeroCarteira: 17,
  numeroVariacaoCarteira: 19,
  codigoCliente: 2851693,
  linhaDigitavel: "00190000090285169300800101097178811910000266534",
  codigoBarraNumerico: "00198119100002665340000002851693000010109717",
  numeroContratoCobranca: 19605688,
  nossoNumero: "101097"
};

console.log('🔍 CONSULTA BOLETOS - BANCO DO BRASIL');
console.log('===================================');
console.log('Convênio:', BB_CONFIG.convenio);
console.log('Carteira:', BB_CONFIG.carteira);
console.log('Boleto do histórico:', BOLETO_HISTORICO.numero);
console.log('Nosso número:', BOLETO_HISTORICO.nossoNumero);
console.log('');

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

async function obterToken() {
  console.log('🔐 PASSO 1: Obtendo token OAuth2...');
  
  const postData = `grant_type=client_credentials&scope=cobrancas.boletos-requisicao cobrancas.boletos-info`;
  const auth = Buffer.from(`${BB_CONFIG.client_id}:${BB_CONFIG.client_secret}`).toString('base64');
  
  const options = {
    hostname: 'oauth.bb.com.br',
    port: 443,
    path: '/oauth/token',
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${auth}`,
      'Content-Length': Buffer.byteLength(postData)
    }
  };
  
  const response = await httpsRequest(options, postData);
  
  if (response.statusCode === 200) {
    const tokenData = JSON.parse(response.data);
    console.log('   ✅ Token obtido com sucesso!');
    return tokenData.access_token;
  } else {
    throw new Error('Falha ao obter token OAuth BB');
  }
}

async function consultarBoletoPorNumero(token, nossoNumero) {
  console.log(`\\n📋 PASSO 2: Consultando boleto por número do título...`);
  console.log(`   Nosso Número: ${nossoNumero}`);
  
  // Formato EXATO do numeroTituloCliente (20 dígitos)
  const numeroTituloFormatado = `000${("0000000" + BB_CONFIG.convenio).slice(-7)}${("0000000" + Number(nossoNumero)).slice(-10)}`;
  console.log(`   Número formatado: ${numeroTituloFormatado}`);
  
  const path = `/cobrancas/v2/boletos/${numeroTituloFormatado}?gw-dev-app-key=${BB_CONFIG.developer_key}&numeroConvenio=${BB_CONFIG.convenio}`;
  
  console.log(`   URL: https://api.bb.com.br${path}`);
  
  const options = {
    hostname: 'api.bb.com.br',
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  };
  
  const response = await httpsRequest(options);
  
  console.log('   Status:', response.statusCode);
  
  if (response.statusCode === 200) {
    const consulta = JSON.parse(response.data);
    console.log('   ✅ Consulta realizada com sucesso!');
    
    if (consulta.boletos && consulta.boletos.length > 0) {
      console.log(`\\n📄 BOLETOS ENCONTRADOS: ${consulta.boletos.length}`);
      
      consulta.boletos.forEach((boleto, index) => {
        console.log(`\\n   Boleto ${index + 1}:`);
        console.log(`   - Número: ${boleto.numero}`);
        console.log(`   - Estado: ${boleto.estadoTituloCobranca}`);
        console.log(`   - Valor: R$ ${boleto.valorOriginal.toFixed(2)}`);
        console.log(`   - Vencimento: ${boleto.dataVencimento}`);
        console.log(`   - Nosso Número: ${boleto.numeroCarteira}/${boleto.nossoNumero}`);
        console.log(`   - Linha Digitável: ${boleto.linhaDigitavel}`);
        
        if (boleto.qrCode) {
          console.log(`   - PIX TX ID: ${boleto.qrCode.txId}`);
          console.log(`   - PIX URL: ${boleto.qrCode.url}`);
        }
      });
      
      return consulta.boletos;
    } else {
      console.log('   ⚠️ Nenhum boleto encontrado');
    }
  } else {
    console.log('   ❌ Erro na consulta:', response.data);
  }
  
  return null;
}

async function listarTodosBoletos(token) {
  console.log(`\\n📋 PASSO 3: Listando todos os boletos do convênio...`);
  
  const hoje = new Date();
  const dataInicio = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1); // Mês passado
  const dataFim = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0); // Final deste mês
  
  const formatarData = (data) => {
    const dia = data.getDate().toString().padStart(2, '0');
    const mes = (data.getMonth() + 1).toString().padStart(2, '0');
    const ano = data.getFullYear();
    return `${dia}.${mes}.${ano}`;
  };
  
  const path = `/cobrancas/v2/boletos?numeroConvenio=${BB_CONFIG.convenio}&numeroCarteira=${BB_CONFIG.carteira}&numeroVariacaoCarteira=19&dataInicioVencimento=${formatarData(dataInicio)}&dataFimVencimento=${formatarData(dataFim)}`;
  
  console.log(`   URL: https://api.bb.com.br${path}`);
  
  const options = {
    hostname: 'api.bb.com.br',
    port: 443,
    path: path,
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Developer-Application-Key': BB_CONFIG.developer_key
    }
  };
  
  const response = await httpsRequest(options);
  
  console.log('   Status:', response.statusCode);
  
  if (response.statusCode === 200) {
    const consulta = JSON.parse(response.data);
    console.log('   ✅ Listagem realizada com sucesso!');
    
    if (consulta.boletos && consulta.boletos.length > 0) {
      console.log(`\\n📄 TOTAL DE BOLETOS ENCONTRADOS: ${consulta.boletos.length}`);
      
      consulta.boletos.slice(0, 5).forEach((boleto, index) => { // Mostrar apenas os 5 primeiros
        console.log(`\\n   Boleto ${index + 1}:`);
        console.log(`   - Número: ${boleto.numero}`);
        console.log(`   - Estado: ${boleto.estadoTituloCobranca}`);
        console.log(`   - Valor: R$ ${boleto.valorOriginal.toFixed(2)}`);
        console.log(`   - Vencimento: ${boleto.dataVencimento}`);
        console.log(`   - Nosso Número: ${boleto.nossoNumero}`);
      });
      
      if (consulta.boletos.length > 5) {
        console.log(`\\n   ... e mais ${consulta.boletos.length - 5} boletos`);
      }
      
      return consulta.boletos;
    } else {
      console.log('   ⚠️ Nenhum boleto encontrado no período');
    }
  } else {
    console.log('   ❌ Erro na listagem:', response.data);
  }
  
  return null;
}

async function consultaCompleta() {
  try {
    const token = await obterToken();
    
    // Tentar consultar o boleto específico do histórico
    await consultarBoletoPorNumero(token, BOLETO_HISTORICO.nossoNumero);
    
    // Listar todos os boletos para ver o padrão
    await listarTodosBoletos(token);
    
    console.log('\\n🎉 CONSULTA CONCLUÍDA!');
    console.log('\\n💡 INFORMAÇÕES ÚTEIS:');
    console.log('   - Use os padrões encontrados para criar novos boletos');
    console.log('   - Observe o formato do "nossoNumero" dos boletos existentes');
    console.log('   - Verifique como o BB numera os títulos automaticamente');
    
  } catch (error) {
    console.error('❌ Erro:', error.message);
  }
}

// Executar
consultaCompleta();
#!/usr/bin/env node
/**
 * MCP MAAX COB - Servidor MCP
 * 
 * Suporta múltiplos transportes:
 * - STDIO: Para Claude Desktop (padrão)
 * - HTTP/SSE: Para aplicações web
 * - WebSocket: Para comunicação em tempo real
 * - Hybrid: Todos simultaneamente
 * 
 * Uso:
 *   MCP_TRANSPORT=stdio npm run mcp       # Claude Desktop
 *   MCP_TRANSPORT=http npm run mcp        # Web/API
 *   MCP_TRANSPORT=websocket npm run mcp   # Real-time
 *   MCP_TRANSPORT=hybrid npm run mcp      # Todos
 */

import { MCPChargeServer } from './src/mcp/server.js';
import { MCPTransportManager } from './src/mcp/transports.js';
import { env } from './src/env.js';

async function main() {
  try {
    console.error("========================================");
    console.error("      MCP MAAX COB - Servidor MCP      ");
    console.error("========================================");
    console.error("");
    
    // Verificar configuração
    const transport = process.env.MCP_TRANSPORT || 'stdio';
    console.error(`[Config] Transporte: ${transport}`);
    console.error(`[Config] Ambiente: ${env.isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
    console.error("");

    // Inicializar servidor MCP
    const server = new MCPChargeServer();
    
    // Configurar e iniciar transporte
    const transportManager = new MCPTransportManager(server.getServer());
    await transportManager.start();

    console.error("");
    console.error("[MCP] Servidor iniciado com sucesso!");
    console.error("");
    
    // Instruções específicas por transporte
    switch (transport) {
      case 'stdio':
        console.error("📝 Modo STDIO - Use com Claude Desktop:");
        console.error("   Adicione ao claude_desktop_config.json:");
        console.error(`   {
     "mcpServers": {
       "mcp-maax-cob": {
         "command": "node",
         "args": ["${process.cwd()}/dist/mcp.js"]
       }
     }
   }`);
        break;
      
      case 'http':
      case 'sse':
        const httpPort = process.env.MCP_HTTP_PORT || 3001;
        console.error("🌐 Modo HTTP/SSE - Endpoints disponíveis:");
        console.error(`   SSE: http://localhost:${httpPort}/mcp`);
        console.error(`   Health: http://localhost:${httpPort}/health`);
        console.error(`   Tools: http://localhost:${httpPort}/tools`);
        break;
      
      case 'websocket':
      case 'ws':
        const wsPort = process.env.MCP_WS_PORT || 3002;
        console.error("🔌 Modo WebSocket - Conecte em:");
        console.error(`   ws://localhost:${wsPort}`);
        console.error("   Teste com: wscat -c ws://localhost:" + wsPort);
        break;
      
      case 'hybrid':
        console.error("🚀 Modo Híbrido - Todos os transportes ativos:");
        console.error("   STDIO: Para Claude Desktop");
        console.error(`   HTTP: http://localhost:${process.env.MCP_HTTP_PORT || 3001}/mcp`);
        console.error(`   WebSocket: ws://localhost:${process.env.MCP_WS_PORT || 3002}`);
        break;
    }
    
    console.error("");
    console.error("========================================");

    // Manter processo rodando
    process.on('SIGINT', async () => {
      console.error("\n[MCP] Encerrando servidor...");
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.error("\n[MCP] Encerrando servidor...");
      process.exit(0);
    });

  } catch (error) {
    console.error("[MCP] Erro ao iniciar servidor:", error);
    process.exit(1);
  }
}

// Executar
main().catch(console.error);
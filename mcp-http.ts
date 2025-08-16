#!/usr/bin/env node
/**
 * MCP MAAX COB - Servidor HTTP MCP
 * 
 * Segue o protocolo MCP oficial (2024-11-05)
 * - JSON-RPC 2.0 puro via POST /mcp
 * - Sem sessions ou SSE
 * - Suporte a initialize, tools/list, tools/call
 */

import { MCPChargeServer } from './src/mcp/server.js';
import { HTTPMCPTransport } from './src/mcp/http-transport.js';
import { env } from './src/env.js';

async function main() {
  try {
    console.error("========================================");
    console.error("    MCP MAAX COB - HTTP Transport       ");
    console.error("========================================");
    console.error("");
    
    const port = parseInt(process.env.MCP_HTTP_PORT || '4004');
    console.error(`[Config] Porta HTTP: ${port}`);
    console.error(`[Config] Ambiente: ${env.isProduction ? 'PRODUÇÃO' : 'DESENVOLVIMENTO'}`);
    console.error("");

    // Criar servidor MCP
    const mcpServer = new MCPChargeServer();
    
    // Criar transporte HTTP
    const transport = new HTTPMCPTransport();
    
    // Iniciar servidor
    await transport.listen(port);

    console.error("");
    console.error("[MCP] Servidor HTTP iniciado com sucesso!");
    console.error("");
    console.error("📋 ENDPOINTS DISPONÍVEIS:");
    console.error(`   POST http://localhost:${port}/mcp     - Main MCP endpoint`);
    console.error(`   GET  http://localhost:${port}/health  - Health check`);
    console.error(`   GET  http://localhost:${port}/debug   - Debug info`);
    console.error(`   GET  http://localhost:${port}/tools   - List tools`);
    console.error("");
    console.error("🧪 TESTE RÁPIDO:");
    console.error("   curl http://localhost:" + port + "/health");
    console.error("");
    console.error("📝 PROTOCOLO MCP:");
    console.error("   - JSON-RPC 2.0 via POST");
    console.error("   - Métodos: initialize, tools/list, tools/call");
    console.error("   - Sem sessions ou SSE");
    console.error("");
    console.error("========================================");

    // Manter processo rodando
    process.on('SIGINT', () => {
      console.error("\n[MCP] Encerrando servidor...");
      process.exit(0);
    });

    process.on('SIGTERM', () => {
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
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// WebSocket transport will be added when SDK supports it
// import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/websocket.js";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";

/**
 * Configuração de transportes MCP
 * Suporta: stdio, HTTP/SSE, WebSocket
 */

export class MCPTransportManager {
  private server: Server;
  private transportType: string;

  constructor(server: Server) {
    this.server = server;
    this.transportType = process.env.MCP_TRANSPORT || "stdio";
  }

  async start() {
    console.error(`[MCP] Iniciando com transporte: ${this.transportType}`);
    
    switch (this.transportType) {
      case "stdio":
        await this.startStdio();
        break;
      
      case "http":
      case "sse":
        await this.startHTTP();
        break;
      
      case "websocket":
      case "ws":
        await this.startWebSocket();
        break;
      
      case "hybrid":
        // Inicia múltiplos transportes simultaneamente
        await this.startHybrid();
        break;
      
      default:
        throw new Error(`Transporte não suportado: ${this.transportType}`);
    }
  }

  /**
   * STDIO Transport (padrão para Claude Desktop)
   * Comunicação via entrada/saída padrão
   */
  private async startStdio() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("[MCP] Server rodando em STDIO (stdin/stdout)");
    console.error("[MCP] Use com Claude Desktop ou CLI MCP");
  }

  /**
   * HTTP/SSE Transport
   * Server-Sent Events para comunicação unidirecional
   */
  private async startHTTP() {
    const app = express();
    const port = process.env.MCP_HTTP_PORT || 3001;

    // Middleware para CORS
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type, X-API-Key");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      next();
    });

    app.use(express.json());

    // SSE endpoint handler
    app.get("/mcp", async (req, res) => {
      const transport = new SSEServerTransport("/mcp", res);
      await this.server.connect(transport);
      await transport.start();
    });
    
    // POST handler para mensagens
    app.post("/mcp", async (req, res) => {
      // As mensagens POST serão tratadas pelo transport SSE
      res.status(200).json({ status: "ok" });
    });

    // Health check
    app.get("/health", (req, res) => {
      res.json({ 
        status: "ok", 
        transport: "http/sse",
        mcp_version: "1.0.0"
      });
    });

    // Endpoint para listar ferramentas (útil para debug)
    app.get("/tools", async (req, res) => {
      res.json({
        tools: [
          "create_charge",
          "retrieve_charge", 
          "list_charges",
          "cancel_charge",
          "apply_instruction"
        ]
      });
    });

    app.listen(port, () => {
      console.error(`[MCP] HTTP/SSE server rodando em http://localhost:${port}`);
      console.error(`[MCP] SSE endpoint: http://localhost:${port}/mcp`);
    });
  }

  /**
   * WebSocket Transport
   * Comunicação bidirecional em tempo real
   */
  private async startWebSocket() {
    const port = parseInt(process.env.MCP_WS_PORT || "3002");
    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });

    // WebSocket transport será implementado quando SDK suportar
    // const transport = new WebSocketServerTransport(wss);
    // await this.server.connect(transport);
    
    // Por enquanto, implementação manual
    wss.on('connection', (ws) => {
      console.error("[MCP] Cliente WebSocket conectado");
      ws.on('message', (data) => {
        // Processar mensagens MCP via WebSocket
        console.error("[MCP] Mensagem recebida:", data.toString());
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          result: "WebSocket MCP em desenvolvimento"
        }));
      });
    });

    // Health check via HTTP
    httpServer.on("request", (req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ 
          status: "ok", 
          transport: "websocket",
          ws_url: `ws://localhost:${port}`
        }));
      } else {
        res.writeHead(404);
        res.end("Not Found");
      }
    });

    httpServer.listen(port, () => {
      console.error(`[MCP] WebSocket server rodando em ws://localhost:${port}`);
    });
  }

  /**
   * Hybrid Mode - Múltiplos transportes simultaneamente
   * Útil para desenvolvimento e testes
   */
  private async startHybrid() {
    console.error("[MCP] Iniciando modo híbrido (múltiplos transportes)");
    
    // Clonar o servidor para cada transporte
    const servers = {
      stdio: this.server,
      http: this.cloneServer(),
      websocket: this.cloneServer()
    };

    // Iniciar STDIO
    if (process.stdin.isTTY === false) {
      const stdioTransport = new StdioServerTransport();
      await servers.stdio.connect(stdioTransport);
      console.error("[MCP] ✓ STDIO ativo");
    }

    // Iniciar HTTP/SSE
    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "*");
      next();
    });
    
    // SSE handler para modo híbrido
    app.get("/mcp", async (req, res) => {
      const transport = new SSEServerTransport("/mcp", res);
      await servers.http.connect(transport);
      await transport.start();
    });
    
    app.post("/mcp", async (req, res) => {
      res.status(200).json({ status: "ok" });
    });
    
    const httpPort = process.env.MCP_HTTP_PORT || 3001;
    app.listen(httpPort, () => {
      console.error(`[MCP] ✓ HTTP/SSE ativo em http://localhost:${httpPort}/mcp`);
    });

    // Iniciar WebSocket (implementação simplificada por enquanto)
    const wsPort = parseInt(process.env.MCP_WS_PORT || "3002");
    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });
    
    // WebSocket será implementado quando SDK suportar
    // const wsTransport = new WebSocketServerTransport(wss);
    // await servers.websocket.connect(wsTransport);
    
    wss.on('connection', (ws) => {
      console.error("[MCP] Cliente WebSocket conectado (modo híbrido)");
      ws.on('message', (data) => {
        ws.send(JSON.stringify({
          jsonrpc: "2.0",
          result: "WebSocket MCP em desenvolvimento"
        }));
      });
    });
    
    httpServer.listen(wsPort, () => {
      console.error(`[MCP] ✓ WebSocket ativo em ws://localhost:${wsPort}`);
    });

    console.error("[MCP] Modo híbrido ativo - todos os transportes disponíveis");
  }

  private cloneServer(): Server {
    // Criar nova instância do servidor com mesma configuração
    // Isso é necessário porque cada transporte precisa de sua própria instância
    return new Server(
      {
        name: "mcp-maax-cob",
        version: "1.0.0"
      },
      {
        capabilities: {
          tools: {}
        }
      }
    );
  }
}

/**
 * Exemplo de como usar diferentes transportes:
 * 
 * 1. STDIO (Claude Desktop):
 *    MCP_TRANSPORT=stdio npm run mcp
 * 
 * 2. HTTP/SSE (Browser/Apps):
 *    MCP_TRANSPORT=http npm run mcp
 *    curl http://localhost:3001/mcp
 * 
 * 3. WebSocket (Real-time):
 *    MCP_TRANSPORT=websocket npm run mcp
 *    wscat -c ws://localhost:3002
 * 
 * 4. Hybrid (Todos):
 *    MCP_TRANSPORT=hybrid npm run mcp
 */
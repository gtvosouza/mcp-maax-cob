import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
// WebSocket transport will be added when SDK supports it
// import { WebSocketServerTransport } from "@modelcontextprotocol/sdk/server/websocket.js";
import express from "express";
import { createServer } from "http";
import { WebSocketServer } from "ws";
import jwt from "jsonwebtoken";
import { extractBearerToken } from "../utils/auth.js";

/**
 * Configuração de transportes MCP
 * Suporta: stdio, HTTP/SSE, WebSocket
 */

export class MCPTransportManager {
  private server: Server;
  private mcpChargeServer: any; // MCPChargeServer instance
  private transportType: string;

  constructor(server: Server, mcpChargeServer?: any) {
    this.server = server;
    this.mcpChargeServer = mcpChargeServer;
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

    // Middleware para limpar URLs com caracteres invisíveis
    app.use((req: any, res: any, next: any) => {
      // Limpar caracteres invisíveis da URL
      const cleanPath = req.path.replace(/[\u200B-\u200D\uFEFF]/g, '');
      if (cleanPath !== req.path) {
        console.error(`[MCP] URL com caracteres invisíveis detectada: ${req.path} -> ${cleanPath}`);
        req.url = req.url.replace(req.path, cleanPath);
        // Não podemos modificar req.path diretamente, mas o roteamento usará a URL limpa
      }
      next();
    });

    // Middleware de autenticação JWT Bearer Token
    const validateJwtToken = (req: any, res: any, next: any) => {
      const authHeader = req.headers['authorization'];
      const token = extractBearerToken(authHeader);

      if (!token) {
        return res.status(401).json({
          error: "Invalid or missing Bearer token",
          code: "UNAUTHORIZED"
        });
      }

      const tokenSecret = process.env.MCP_TOKEN_SECRET;
      if (!tokenSecret) {
        console.error('[MCP] MCP_TOKEN_SECRET not configured');
        return res.status(500).json({
          error: "Server authentication not configured",
          code: "SERVER_ERROR"
        });
      }

      try {
        const decoded = jwt.verify(token, tokenSecret) as any;

        // Adicionar dados decodificados ao request para uso posterior
        req.mcpAuth = {
          company: decoded.company,
          provider: decoded.provider,
          apiKey: decoded.credentials?.apiKey,
          meta: decoded.meta
        };

        next();
      } catch (error: any) {
        console.error('[MCP] JWT verification failed:', error.message);
        return res.status(401).json({
          error: "Invalid or expired token",
          code: "UNAUTHORIZED"
        });
      }
    };

    // Armazenar transports SSE ativos por sessionId
    const activeTransports = new Map<string, any>();

    // GET /mcp - Abrir stream SSE
    app.get("/mcp", validateJwtToken, async (req: any, res: any) => {
      console.error(`[MCP] 📡 GET /mcp - Abrindo stream SSE`);
      console.error(`[MCP] Auth:`, {
        company: req.mcpAuth?.company,
        provider: req.mcpAuth?.provider
      });

      // Criar transport SSE para esta resposta
      const transport = new SSEServerTransport("/mcp", res);

      // Conectar servidor a este transport
      await this.server.connect(transport);

      // Iniciar o stream SSE
      await transport.start();

      // Armazenar transport pelo sessionId do SDK
      const sessionId = transport.sessionId;
      activeTransports.set(sessionId, transport);

      console.error(`[MCP] ✅ SSE stream aberto - SessionID: ${sessionId}`);

      // Limpar quando a conexão fechar
      req.on('close', () => {
        console.error(`[MCP] ❌ SSE stream fechado - SessionID: ${sessionId}`);
        activeTransports.delete(sessionId);
      });
    });

    // POST /mcp - Receber mensagens MCP (modo stateless ou SSE)
    app.post("/mcp", validateJwtToken, async (req: any, res: any) => {
      console.error(`[MCP] 📨 POST /mcp - Mensagem recebida`);
      console.error(`[MCP] Corpo:`, JSON.stringify(req.body));

      const message = req.body;

      // Processar mensagem JSON-RPC diretamente (modo stateless)
      try {
        let response: any;

        if (message.method === 'initialize') {
          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: { listChanged: true }
              },
              serverInfo: {
                name: "mcp-maax-cob",
                version: "2.0.0"
              }
            }
          };
          console.error(`[MCP] ✅ Respondendo initialize`);
        } else if (message.method === 'tools/list') {
          // Extract credentials from JWT payload first
          const authHeader = req.headers['authorization'];
          const token = extractBearerToken(authHeader);
          const tokenSecret = process.env.MCP_TOKEN_SECRET;

          let credentials: Record<string, any> | undefined;
          if (token && tokenSecret) {
            try {
              const decoded = jwt.verify(token, tokenSecret) as any;
              credentials = decoded.credentials;

              // Set provider and credentials context
              if (this.mcpChargeServer) {
                if (decoded.provider) {
                  this.mcpChargeServer.setProviderContext(decoded.provider);
                }
                if (credentials) {
                  this.mcpChargeServer.setCredentialsContext(credentials);
                }
              }
            } catch (err) {
              console.error('[MCP] ⚠️ Failed to decode JWT for credentials:', err);
            }
          }

          // Call dynamic discovery from MCPChargeServer
          let tools: any[] = [];
          if (this.mcpChargeServer && typeof this.mcpChargeServer.discoverAvailableTools === 'function') {
            try {
              // Pass credentials to discovery
              tools = await this.mcpChargeServer.discoverAvailableTools(credentials);
              console.error(`[MCP] ✅ Discovery retornou ${tools.length} tools para provider ${req.mcpAuth?.provider}`);
            } catch (err) {
              console.error('[MCP] ⚠️ Discovery failed, usando fallback:', err);
              tools = this.getFallbackTools();
            }
          } else {
            console.error('[MCP] ⚠️ MCPChargeServer não disponível, usando fallback');
            tools = this.getFallbackTools();
          }

          response = {
            jsonrpc: "2.0",
            id: message.id,
            result: { tools }
          };
          console.error(`[MCP] ✅ Respondendo tools/list com ${tools.length} tools`);
        } else if (message.method === 'tools/call') {
          // Set provider and credentials context from JWT
          const authHeader = req.headers['authorization'];
          const token = extractBearerToken(authHeader);
          const tokenSecret = process.env.MCP_TOKEN_SECRET;

          if (token && tokenSecret) {
            try {
              const decoded = jwt.verify(token, tokenSecret) as any;
              if (this.mcpChargeServer) {
                if (decoded.provider) {
                  this.mcpChargeServer.setProviderContext(decoded.provider);
                }
                if (decoded.credentials) {
                  this.mcpChargeServer.setCredentialsContext(decoded.credentials);
                }
              }
            } catch (err) {
              console.error('[MCP] ⚠️ Failed to decode JWT for tools/call:', err);
            }
          }

          // Forward the call to the MCP server's request handler
          const toolName = message.params?.name;
          const toolArgs = message.params?.arguments || {};

          console.error(`[MCP] 📞 tools/call - Tool: ${toolName}`);
          console.error(`[MCP] 📞 Arguments:`, JSON.stringify(toolArgs, null, 2));

          try {
            // Call the tool handler directly
            let result;
            if (this.mcpChargeServer) {
              switch (toolName) {
                case 'get_providers_metadata':
                  result = await this.mcpChargeServer.handleGetProvidersMetadata();
                  break;
                case 'get_account_statement':
                case 'extrato_conta_corrente':
                  result = await this.mcpChargeServer.handleGetAccountStatement(toolArgs);
                  break;
                case 'create_charge':
                  result = await this.mcpChargeServer.handleCreateCharge(toolArgs);
                  break;
                case 'retrieve_charge':
                  result = await this.mcpChargeServer.handleRetrieveCharge(toolArgs);
                  break;
                case 'cancel_charge':
                  result = await this.mcpChargeServer.handleCancelCharge(toolArgs);
                  break;
                case 'apply_instruction':
                  result = await this.mcpChargeServer.handleApplyInstruction(toolArgs);
                  break;
                default:
                  throw new Error(`Unknown tool: ${toolName}`);
              }

              response = {
                jsonrpc: "2.0",
                id: message.id,
                result
              };
              console.error(`[MCP] ✅ Tool ${toolName} executada com sucesso`);
            } else {
              throw new Error('MCP server not available');
            }
          } catch (error: any) {
            console.error(`[MCP] ❌ Error executing tool ${toolName}:`, error);
            response = {
              jsonrpc: "2.0",
              id: message.id,
              error: {
                code: -32603,
                message: error.message || 'Tool execution failed'
              }
            };
          }
        } else {
          response = {
            jsonrpc: "2.0",
            id: message.id,
            error: {
              code: -32601,
              message: `Method not found: ${message.method}`
            }
          };
          console.error(`[MCP] ⚠️ Método desconhecido: ${message.method}`);
        }

        res.status(200).json(response);
      } catch (error: any) {
        console.error(`[MCP] ❌ Erro ao processar mensagem:`, error.message);
        res.status(500).json({
          jsonrpc: "2.0",
          id: message.id,
          error: {
            code: -32603,
            message: `Internal error: ${error.message}`
          }
        });
      }
    });

    // Health check
    app.get("/health", (req, res) => {
      res.json({ 
        status: "ok", 
        transport: "http/sse",
        mcp_version: "2.0.0"
      });
    });

    // Endpoint para listar ferramentas (útil para debug)
    app.get("/tools", async (req, res) => {
      res.json({
        tools: [
          "get_providers_metadata",
          "get_account_statement",
          "create_charge",
          "retrieve_charge", 
          "cancel_charge",
          "apply_instruction"
        ]
      });
    });

    // Endpoint de debug para URLs
    app.get("/debug", (req, res) => {
      res.json({
        received_path: req.path,
        received_url: req.url,
        headers: req.headers,
        query: req.query,
        available_endpoints: [
          "/health",
          "/tools", 
          "/mcp",
          "/mcp/",
          "/debug"
        ],
        note: "Use este endpoint para verificar problemas de URL"
      });
    });

    // Catch-all para URLs similares a /mcp
    app.all("/mcp*", (req, res) => {
      console.error(`[MCP] Tentativa de acesso a variação de /mcp: ${req.path}`);
      res.status(200).json({
        message: "Endpoint MCP detectado com variação",
        received_path: req.path,
        clean_path: req.path.replace(/[\u200B-\u200D\uFEFF]/g, ''),
        redirect_to: "/mcp",
        try_again: "Use exatamente http://localhost:4004/mcp"
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

  /**
   * Fallback tools list (all tools without filtering)
   */
  private getFallbackTools() {
    return [
      {
        name: "get_providers_metadata",
        description: "Obter metadados de todos os provedores disponíveis",
        inputSchema: { type: "object", properties: {}, additionalProperties: false }
      },
      {
        name: "get_account_statement",
        description: "Obtém extrato bancário para provedores suportados (ex.: Banco do Brasil)",
        inputSchema: {
          type: "object",
          properties: {
            provider_id: { type: "string", description: "ID do provedor" },
            agency: { type: "string", description: "Agência sem dígito" },
            account: { type: "string", description: "Conta sem dígito" },
            query: {
              type: "object",
              properties: {
                page: { type: "integer" },
                page_size: { type: "integer" },
                start_date: { type: "string", description: "DDMMAAAA" },
                end_date: { type: "string", description: "DDMMAAAA" }
              }
            }
          },
          required: ["provider_id"]
        }
      },
      {
        name: "create_charge",
        description: "Cria uma nova cobrança (boleto ou PIX)",
        inputSchema: { type: "object", properties: { provider_id: { type: "string" } }, required: ["provider_id"] }
      },
      {
        name: "retrieve_charge",
        description: "Consulta detalhes de uma cobrança existente",
        inputSchema: { type: "object", properties: { provider_id: { type: "string" }, charge_id: { type: "string" } }, required: ["provider_id", "charge_id"] }
      },
      {
        name: "cancel_charge",
        description: "Cancela uma cobrança existente",
        inputSchema: { type: "object", properties: { provider_id: { type: "string" }, charge_id: { type: "string" } }, required: ["provider_id", "charge_id"] }
      },
      {
        name: "apply_instruction",
        description: "Aplica instrução bancária (protesto, baixa, etc.)",
        inputSchema: { type: "object", properties: { provider_id: { type: "string" }, charge_id: { type: "string" }, instruction_code: { type: "string" } }, required: ["provider_id", "charge_id", "instruction_code"] }
      }
    ];
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
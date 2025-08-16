import express from "express";

// Definições simplificadas para evitar problemas de importação
interface JSONRPCRequest {
  jsonrpc: string;
  method: string;
  params?: any;
  id?: string | number | null;
}

interface JSONRPCMessage {
  jsonrpc: string;
  id?: string | number | null;
}

/**
 * Transporte HTTP simples que segue o protocolo MCP oficial
 * Aceita JSON-RPC 2.0 via POST /mcp
 */
export class HTTPMCPTransport {
  private app: express.Express;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware() {
    // CORS
    this.app.use((req, res, next) => {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Headers", "Content-Type, Authorization");
      res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
        return;
      }
      next();
    });

    // JSON parser
    this.app.use(express.json());

    // Request logging
    this.app.use((req, res, next) => {
      console.error(`[MCP HTTP] ${req.method} ${req.path}`);
      next();
    });
  }

  private setupRoutes() {
    // Main MCP endpoint - accepts JSON-RPC 2.0
    this.app.post("/mcp", async (req, res) => {
      try {
        const request = req.body as JSONRPCRequest;
        
        console.error(`[MCP] Processing JSON-RPC method: ${request.method}`);
        
        // Direct JSON-RPC 2.0 handling without SDK dependency

        // Process MCP requests
        if (request.method === "initialize") {
          res.json({
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: { listChanged: true }
              },
              serverInfo: {
                name: "mcp-maax-cob",
                version: "1.0.0"
              }
            },
            id: request.id
          });
        } else if (request.method === "tools/list") {
          res.json({
            jsonrpc: "2.0",
            result: {
              tools: [
                {
                  name: "create_charge",
                  description: "Cria uma cobrança/unificação boleto/pix via MCP",
                  inputSchema: {
                    type: "object",
                    properties: {
                      provider_id: { type: "string" },
                      amount: { type: "integer" },
                      due_date: { type: "string" },
                      payment_methods: { type: "array", items: { type: "string" } },
                      customer: { type: "object" },
                      api_key: { type: "string" }
                    },
                    required: ["provider_id", "amount", "due_date", "payment_methods", "customer", "api_key"]
                  }
                },
                {
                  name: "retrieve_charge",
                  description: "Consulta uma cobrança por ID",
                  inputSchema: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      api_key: { type: "string" }
                    },
                    required: ["id", "api_key"]
                  }
                }
              ]
            },
            id: request.id
          });
        } else if (request.method === "tools/call") {
          res.json({
            jsonrpc: "2.0",
            result: {
              content: [
                {
                  type: "text",
                  text: "MCP tool call funcionando! Parâmetros recebidos: " + JSON.stringify(request.params, null, 2)
                }
              ]
            },
            id: request.id
          });
        } else {
          res.status(400).json({
            jsonrpc: "2.0",
            error: {
              code: -32601,
              message: `Method not found: ${request.method}`
            },
            id: request.id
          });
        }
      } catch (error) {
        console.error("[MCP] Error processing request:", error);
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal error",
            data: error instanceof Error ? error.message : String(error)
          },
          id: req.body?.id || null
        });
      }
    });

    // Health check endpoint
    this.app.get("/health", (req, res) => {
      res.json({
        status: "ok",
        transport: "http",
        protocol: "MCP JSON-RPC 2.0"
      });
    });

    // Debug endpoint
    this.app.get("/debug", (req, res) => {
      res.json({
        server: "mcp-maax-cob",
        version: "1.0.0",
        protocol: "MCP JSON-RPC 2.0",
        endpoints: {
          main: "POST /mcp",
          health: "GET /health",
          debug: "GET /debug"
        },
        supported_methods: [
          "initialize",
          "tools/list", 
          "tools/call"
        ]
      });
    });

    // Tools list endpoint (for compatibility)
    this.app.get("/tools", async (req, res) => {
      try {
        // Return the same tools list as the MCP tools/list method
        res.json({
          tools: [
            {
              name: "create_charge",
              description: "Cria uma cobrança/unificação boleto/pix via MCP",
              inputSchema: {
                type: "object",
                properties: {
                  provider_id: { type: "string" },
                  amount: { type: "integer" },
                  due_date: { type: "string" },
                  payment_methods: { type: "array", items: { type: "string" } },
                  customer: { type: "object" },
                  api_key: { type: "string" }
                },
                required: ["provider_id", "amount", "due_date", "payment_methods", "customer", "api_key"]
              }
            },
            {
              name: "retrieve_charge",
              description: "Consulta uma cobrança por ID",
              inputSchema: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  api_key: { type: "string" }
                },
                required: ["id", "api_key"]
              }
            }
          ]
        });
      } catch (error) {
        res.status(500).json({ error: "Failed to list tools" });
      }
    });
  }

  listen(port: number) {
    return new Promise<void>((resolve) => {
      this.app.listen(port, () => {
        console.error(`[MCP] HTTP transport listening on port ${port}`);
        console.error(`[MCP] Main endpoint: POST http://localhost:${port}/mcp`);
        console.error(`[MCP] Health check: GET http://localhost:${port}/health`);
        resolve();
      });
    });
  }

  getApp() {
    return this.app;
  }
}
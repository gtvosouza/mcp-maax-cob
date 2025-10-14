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
                      provider_id: { type: "string", description: "ID do provedor de pagamento" },
                      amount: { type: "integer", description: "Valor em centavos" },
                      due_date: { type: "string", format: "date", description: "Data de vencimento (YYYY-MM-DD)" },
                      reference_id: { type: "string", description: "ID de referência para idempotência" },
                      payment_methods: {
                        type: "array",
                        items: { type: "string", enum: ["boleto", "pix"] },
                        description: "Métodos de pagamento disponíveis"
                      },
                      customer: {
                        type: "object",
                        properties: {
                          name: { type: "string" },
                          document: { type: "string" },
                          email: { type: "string" },
                          phone: { type: "string" },
                          address: {
                            type: "object",
                            properties: {
                              street: { type: "string" },
                              number: { type: "string" },
                              complement: { type: "string" },
                              district: { type: "string" },
                              city: { type: "string" },
                              state: { type: "string" },
                              zipcode: { type: "string" }
                            }
                          }
                        },
                        required: ["name", "document"]
                      },
                      interest: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["percentage", "fixed"] },
                          value: { type: "number" },
                          days_after_due: { type: "integer" }
                        }
                      },
                      fine: {
                        type: "object",
                        properties: {
                          type: { type: "string", enum: ["percentage", "fixed"] },
                          value: { type: "number" }
                        }
                      },
                      discounts: {
                        type: "array",
                        items: {
                          type: "object",
                          properties: {
                            type: { type: "string", enum: ["percentage", "fixed"] },
                            value: { type: "number" },
                            days_before_due: { type: "integer" }
                          }
                        }
                      },
                      api_key: { type: "string", description: "Chave de API pública" }
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
                      id: { type: "string", description: "ID da cobrança" },
                      api_key: { type: "string", description: "Chave de API pública" }
                    },
                    required: ["id", "api_key"]
                  }
                },
                {
                  description: "Lista cobranças com paginação por cursor",
                  inputSchema: {
                    type: "object",
                    properties: {
                      limit: { type: "integer", description: "Limite de resultados" },
                      starting_after: { type: "string", description: "Cursor para paginação" },
                      api_key: { type: "string", description: "Chave de API pública" }
                    },
                    required: ["api_key"]
                  }
                },
                {
                  name: "cancel_charge",
                  description: "Cancela uma cobrança",
                  inputSchema: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "ID da cobrança" },
                      api_key: { type: "string", description: "Chave de API pública" }
                    },
                    required: ["id", "api_key"]
                  }
                },
                {
                  name: "apply_instruction",
                  description: "Aplica instruções (ex.: mudança de vencimento)",
                  inputSchema: {
                    type: "object",
                    properties: {
                      id: { type: "string", description: "ID da cobrança" },
                      instruction_type: { type: "string", description: "Tipo de instrução" },
                      parameters: { type: "object", description: "Parâmetros da instrução" },
                      api_key: { type: "string", description: "Chave de API pública" }
                    },
                    required: ["id", "instruction_type", "api_key"]
                  }
                }
              ]
            },
            id: request.id
          });
        } else if (request.method === "tools/call") {
          // Executar a chamada real da ferramenta via servidor MCP
          try {
            const toolName = request.params?.name;
            const toolArgs = request.params?.arguments ?? {};

            console.error(`[MCP] Executing tool: ${toolName} with args:`, toolArgs);

            const { MCPChargeServer } = await import('./server.js');
            const mcpServer = new MCPChargeServer();

            let result;
            switch (toolName) {
              case "get_providers_metadata":
                result = await mcpServer.handleGetProvidersMetadata();
                break;
              case "get_account_statement":
                result = await mcpServer.handleGetAccountStatement(toolArgs);
                break;
              case "create_charge":
                result = await mcpServer.handleCreateCharge(toolArgs);
                break;
              case "retrieve_charge":
                result = await mcpServer.handleRetrieveCharge(toolArgs);
                break;
              case "cancel_charge":
                result = await mcpServer.handleCancelCharge(toolArgs);
                break;
              case "apply_instruction":
                result = await mcpServer.handleApplyInstruction(toolArgs);
                break;
              default:
                throw new Error(`Unknown tool: ${toolName}`);
            }

            res.json({
              jsonrpc: "2.0",
              result,
              id: request.id
            });
            
          } catch (error) {
            console.error(`[MCP] Tool execution error:`, error);
            res.json({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Tool execution failed",
                data: error instanceof Error ? error.message : String(error)
              },
              id: request.id
            });
          }
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
                  provider_id: { type: "string", description: "ID do provedor de pagamento" },
                  amount: { type: "integer", description: "Valor em centavos" },
                  due_date: { type: "string", format: "date", description: "Data de vencimento (YYYY-MM-DD)" },
                  reference_id: { type: "string", description: "ID de referência para idempotência" },
                  payment_methods: {
                    type: "array",
                    items: { type: "string", enum: ["boleto", "pix"] },
                    description: "Métodos de pagamento disponíveis"
                  },
                  customer: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      document: { type: "string" },
                      email: { type: "string" },
                      phone: { type: "string" },
                      address: {
                        type: "object",
                        properties: {
                          street: { type: "string" },
                          number: { type: "string" },
                          complement: { type: "string" },
                          district: { type: "string" },
                          city: { type: "string" },
                          state: { type: "string" },
                          zipcode: { type: "string" }
                        }
                      }
                    },
                    required: ["name", "document"]
                  },
                  interest: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["percentage", "fixed"] },
                      value: { type: "number" },
                      days_after_due: { type: "integer" }
                    }
                  },
                  fine: {
                    type: "object",
                    properties: {
                      type: { type: "string", enum: ["percentage", "fixed"] },
                      value: { type: "number" }
                    }
                  },
                  discounts: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        type: { type: "string", enum: ["percentage", "fixed"] },
                        value: { type: "number" },
                        days_before_due: { type: "integer" }
                      }
                    }
                  },
                  api_key: { type: "string", description: "Chave de API pública" }
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
                  id: { type: "string", description: "ID da cobrança" },
                  api_key: { type: "string", description: "Chave de API pública" }
                },
                required: ["id", "api_key"]
              }
            },
            {
              description: "Lista cobranças com paginação por cursor",
              inputSchema: {
                type: "object",
                properties: {
                  limit: { type: "integer", description: "Limite de resultados" },
                  starting_after: { type: "string", description: "Cursor para paginação" },
                  api_key: { type: "string", description: "Chave de API pública" }
                },
                required: ["api_key"]
              }
            },
            {
              name: "cancel_charge",
              description: "Cancela uma cobrança",
              inputSchema: {
                type: "object",
                properties: {
                  id: { type: "string", description: "ID da cobrança" },
                  api_key: { type: "string", description: "Chave de API pública" }
                },
                required: ["id", "api_key"]
              }
            },
            {
              name: "apply_instruction",
              description: "Aplica instruções (ex.: mudança de vencimento)",
              inputSchema: {
                type: "object",
                properties: {
                  id: { type: "string", description: "ID da cobrança" },
                  instruction_type: { type: "string", description: "Tipo de instrução" },
                  parameters: { type: "object", description: "Parâmetros da instrução" },
                  api_key: { type: "string", description: "Chave de API pública" }
                },
                required: ["id", "instruction_type", "api_key"]
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
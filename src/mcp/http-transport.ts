import express from "express";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { JSONRPCMessage, JSONRPCRequest, JSONRPCResponse } from "@modelcontextprotocol/sdk/types.js";

/**
 * Transporte HTTP simples que segue o protocolo MCP oficial
 * Aceita JSON-RPC 2.0 via POST /mcp
 */
export class HTTPMCPTransport {
  private server: Server;
  private app: express.Express;

  constructor(server: Server) {
    this.server = server;
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
        
        // Create a simple transport interface for the server
        const transport = {
          start: async () => {},
          close: async () => {},
          send: async (message: JSONRPCMessage) => {
            res.json(message);
          }
        };

        // Connect server to our transport
        await this.server.connect(transport as any);

        // Process the request through the server
        if (request.method === "initialize") {
          const response = await this.server.request(
            { method: "initialize", params: request.params },
            request.id as string | number
          );
          res.json({
            jsonrpc: "2.0",
            result: response,
            id: request.id
          });
        } else if (request.method === "tools/list") {
          const response = await this.server.request(
            { method: "tools/list", params: request.params || {} },
            request.id as string | number
          );
          res.json({
            jsonrpc: "2.0",
            result: response,
            id: request.id
          });
        } else if (request.method === "tools/call") {
          const response = await this.server.request(
            { method: "tools/call", params: request.params },
            request.id as string | number
          );
          res.json({
            jsonrpc: "2.0",
            result: response,
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
        const response = await this.server.request(
          { method: "tools/list", params: {} },
          "tools-list"
        );
        res.json(response);
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
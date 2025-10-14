import type { FastifyInstance } from "fastify";
import { MCPChargeServer } from "../mcp/server";
import jwt from "jsonwebtoken";
import { extractBearerToken } from "../utils/auth";

interface JSONRPCRequest {
  jsonrpc: string;
  method: string;
  params?: any;
  id?: string | number | null;
}

export async function registerMcpRoute(app: FastifyInstance): Promise<void> {
  const mcpServer = new MCPChargeServer();

  app.post("/mcp", async (request, reply) => {
    try {
      const rpcRequest = request.body as JSONRPCRequest;

      app.log.info({ method: rpcRequest.method }, "Processing MCP JSON-RPC request");

      // Handle MCP protocol methods
      switch (rpcRequest.method) {
        case "initialize": {
          return reply.send({
            jsonrpc: "2.0",
            result: {
              protocolVersion: "2024-11-05",
              capabilities: {
                tools: { listChanged: true }
              },
              serverInfo: {
                name: "mcp-maax-cob",
                version: "2.0.0"
              }
            },
            id: rpcRequest.id
          });
        }

        case "tools/list": {
          // Extract credentials from JWT payload first
          const authHeader = request.headers.authorization;
          const token = extractBearerToken(authHeader);
          const tokenSecret = app.appContext.env.mcpTokenSecret;

          app.log.info({
            hasAuthHeader: !!authHeader,
            hasToken: !!token,
            tokenLength: token?.length,
            tokenPreview: token ? `${token.substring(0, 20)}...` : null,
            secretConfigured: !!tokenSecret,
            secretLength: tokenSecret?.length,
            secretPreview: tokenSecret ? `${tokenSecret.substring(0, 10)}...` : null
          }, "JWT Debug Info");

          let credentials: Record<string, any> | undefined;
          if (token && tokenSecret) {
            try {
              const decoded = jwt.verify(token, tokenSecret) as any;
              credentials = decoded.credentials;

              app.log.info({
                provider: decoded.provider,
                company: decoded.company,
                hasCredentials: !!credentials
              }, "JWT decoded successfully");

              // Set provider and credentials context
              if (decoded.provider) {
                mcpServer.setProviderContext(decoded.provider);
              }
              if (decoded.company) {
                mcpServer.setCompanyContext(decoded.company);
              }
              if (credentials) {
                mcpServer.setCredentialsContext(credentials);
              }
            } catch (err) {
              app.log.warn({ err, tokenSecret }, "Failed to decode JWT for credentials");
            }
          } else {
            app.log.warn({ hasToken: !!token, hasSecret: !!tokenSecret }, "Missing token or secret");
          }

          // Now discover tools based on credentials
          const tools = await mcpServer.discoverAvailableTools(credentials);
          return reply.send({
            jsonrpc: "2.0",
            result: { tools },
            id: rpcRequest.id
          });
        }

        case "tools/call": {
          try {
            // Extract credentials from JWT payload
            const authHeader = request.headers.authorization;
            const token = extractBearerToken(authHeader);
            const tokenSecret = app.appContext.env.mcpTokenSecret;

            if (token && tokenSecret) {
              try {
                const decoded = jwt.verify(token, tokenSecret) as any;

                // Set context from JWT
                if (decoded.provider) {
                  mcpServer.setProviderContext(decoded.provider);
                }
                if (decoded.company) {
                  mcpServer.setCompanyContext(decoded.company);
                }
                if (decoded.credentials) {
                  mcpServer.setCredentialsContext(decoded.credentials);
                }
              } catch (err) {
                app.log.warn({ err }, "Failed to decode JWT for tool execution");
              }
            }

            const toolName = rpcRequest.params?.name;
            const toolArgs = rpcRequest.params?.arguments ?? {};

            app.log.info({ toolName, toolArgs }, "Executing MCP tool");

            let result;
            switch (toolName) {
              case "get_account_statement":
              case "extrato_conta_corrente":
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

            return reply.send({
              jsonrpc: "2.0",
              result,
              id: rpcRequest.id
            });
          } catch (error) {
            app.log.error({ err: error }, "Tool execution failed");
            return reply.send({
              jsonrpc: "2.0",
              error: {
                code: -32603,
                message: "Tool execution failed",
                data: error instanceof Error ? error.message : String(error)
              },
              id: rpcRequest.id
            });
          }
        }

        default: {
          return reply.status(400).send({
            jsonrpc: "2.0",
            error: {
              code: -32601,
              message: `Method not found: ${rpcRequest.method}`
            },
            id: rpcRequest.id
          });
        }
      }
    } catch (error) {
      app.log.error({ err: error }, "Error processing MCP request");
      return reply.status(500).send({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal error",
          data: error instanceof Error ? error.message : String(error)
        },
        id: (request.body as any)?.id || null
      });
    }
  });
}

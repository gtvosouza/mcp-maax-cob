import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { ChargeRequest } from "../api/schemas";
import { getPublicKey } from "../api/auth";
import { getProvider, insertCharge, requireTenantByPublicKey, setChargeData, getCharge } from "../infra/db";
import { getAdapter } from "../adapters";
import { metricsCollector } from "../infra/metrics";

class MCPChargeServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-maax-cob",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: { 
            listChanged: true 
          },
        },
      }
    );

    this.setupRequestHandlers();
    this.setupErrorHandling();
  }

  private setupRequestHandlers() {
    // Initialize request handler
    this.server.setRequestHandler(InitializeRequestSchema, async (request) => {
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: true }
        },
        serverInfo: {
          name: "mcp-maax-cob",
          version: "1.0.0"
        }
      };
    });
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
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
            name: "list_charges",
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
      };
    });

    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case "create_charge":
          return await this.handleCreateCharge(request.params.arguments);
        
        case "retrieve_charge":
          return await this.handleRetrieveCharge(request.params.arguments);
        
        case "list_charges":
          return await this.handleListCharges(request.params.arguments);
        
        case "cancel_charge":
          return await this.handleCancelCharge(request.params.arguments);
        
        case "apply_instruction":
          return await this.handleApplyInstruction(request.params.arguments);
        
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });
  }

  private async handleCreateCharge(args: any) {
    try {
      const { api_key, ...payload } = args;
      
      // Validar API key
      const tenantId = await requireTenantByPublicKey(api_key);
      if (!tenantId) {
        throw new McpError(ErrorCode.InvalidRequest, "Invalid API key");
      }

      // Validar payload
      const parsed = ChargeRequest.safeParse(payload);
      if (!parsed.success) {
        throw new McpError(ErrorCode.InvalidRequest, `Validation error: ${parsed.error.message}`);
      }

      const provider = await getProvider(tenantId, payload.provider_id);
      if (!provider) {
        throw new McpError(ErrorCode.InvalidRequest, "Provider not found");
      }

      const adapter = getAdapter(provider.provider_type, provider.credentials_encrypted, provider.provider_specific_config_encrypted);
      const chargeId = await insertCharge(tenantId, payload.provider_id, payload);
      
      // Track provider request
      metricsCollector.incrementProviderCounter(provider.provider_type, 'requests');
      
      const res = await adapter.createCharge({
        tenantId, providerId: payload.provider_id,
        amount: payload.amount, due_date: payload.due_date,
        reference_id: payload.reference_id,
        payment_methods: payload.payment_methods,
        customer: payload.customer,
        interest: payload.interest, fine: payload.fine, discounts: payload.discounts
      });

      await setChargeData(tenantId, chargeId, {
        provider_charge_id: res.provider_charge_id,
        status: "PENDING",
        data: { ...res.data, payment_methods: payload.payment_methods }
      });

      // Track successful charge creation
      metricsCollector.incrementCounter('charges_created_total');

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: chargeId,
              provider_charge_id: res.provider_charge_id,
              status: "PENDING",
              amount: payload.amount,
              due_date: payload.due_date,
              payment_methods: payload.payment_methods,
              data: res.data
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      // Track failed charge creation
      metricsCollector.incrementCounter('charges_failed_total');
      
      if (error instanceof McpError) {
        throw error;
      }
      
      if (error instanceof Error) {
        // Check if it's a provider-specific error
        if (error.message.includes("auth failed") || error.message.includes("API")) {
          throw new McpError(ErrorCode.InternalError, "Payment provider is temporarily unavailable");
        }
      }
      
      throw new McpError(ErrorCode.InternalError, "Unexpected error creating charge");
    }
  }

  private async handleRetrieveCharge(args: any) {
    try {
      const { api_key, id } = args;
      
      const tenantId = await requireTenantByPublicKey(api_key);
      if (!tenantId) {
        throw new McpError(ErrorCode.InvalidRequest, "Invalid API key");
      }

      const ch = await getCharge(tenantId, id);
      if (!ch) {
        throw new McpError(ErrorCode.InvalidRequest, "Charge not found");
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              id: ch.id,
              provider_charge_id: ch.provider_charge_id,
              status: ch.status,
              amount: ch.amount,
              due_date: ch.due_date,
              payment_methods: ch.data?.payment_methods || [],
              data: ch.data || {},
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, "Unexpected error retrieving charge");
    }
  }

  private async handleListCharges(args: any) {
    // MVP: return empty list for now
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            data: [],
            next_cursor: null
          }, null, 2)
        }
      ]
    };
  }

  private async handleCancelCharge(args: any) {
    try {
      const { api_key, id } = args;
      
      const tenantId = await requireTenantByPublicKey(api_key);
      if (!tenantId) {
        throw new McpError(ErrorCode.InvalidRequest, "Invalid API key");
      }

      const charge = await getCharge(tenantId, id);
      if (!charge) {
        throw new McpError(ErrorCode.InvalidRequest, "Charge not found");
      }

      // Check if charge can be cancelled
      if (charge.status === "CANCELLED") {
        throw new McpError(ErrorCode.InvalidRequest, "Charge is already cancelled");
      }
      if (charge.status === "PAID") {
        throw new McpError(ErrorCode.InvalidRequest, "Cannot cancel a paid charge");
      }

      const provider = await getProvider(tenantId, charge.provider_id);
      if (!provider) {
        throw new McpError(ErrorCode.InvalidRequest, "Provider not found");
      }

      const adapter = getAdapter(provider.provider_type, provider.credentials_encrypted, provider.provider_specific_config_encrypted);
      
      // Track cancellation attempt
      metricsCollector.incrementProviderCounter(provider.provider_type, 'requests');
      
      try {
        const result = await adapter.cancelCharge({
          tenantId,
          providerId: charge.provider_id,
          chargeId: id,
          providerChargeId: charge.provider_charge_id
        });

        if (result.success) {
          await setChargeData(tenantId, id, {
            status: "CANCELLED",
            data: { ...charge.data, cancelled_at: new Date().toISOString(), cancellation_reason: "manual_cancellation" }
          });

          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  id,
                  status: "CANCELLED",
                  cancelled_at: new Date().toISOString(),
                  message: "Charge cancelled successfully"
                }, null, 2)
              }
            ]
          };
        } else {
          throw new McpError(ErrorCode.InvalidRequest, result.error || "Failed to cancel charge with provider");
        }
      } catch (error) {
        // Track failed cancellation
        metricsCollector.incrementProviderCounter(provider.provider_type, 'errors');
        
        // Check if provider doesn't support cancellation
        if (error instanceof Error && error.message.includes("not supported")) {
          throw new McpError(ErrorCode.InvalidRequest, "This payment provider does not support charge cancellation");
        }
        
        throw error;
      }
    } catch (error) {
      if (error instanceof McpError) {
        throw error;
      }
      throw new McpError(ErrorCode.InternalError, "Unexpected error cancelling charge");
    }
  }

  private async handleApplyInstruction(args: any) {
    // MVP: accept and return acknowledgment
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            accepted: true,
            message: "Instruction queued for processing"
          }, null, 2)
        }
      ]
    };
  }

  private setupErrorHandling() {
    this.server.onerror = (error) => {
      console.error("[MCP Error]", error);
    };

    process.on("SIGINT", async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
    console.error("MCP MAAX COB Server running on stdio");
  }

  getServer(): Server {
    return this.server;
  }
}

export { MCPChargeServer };
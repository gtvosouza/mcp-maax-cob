import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
  InitializeRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { getAdapter, getAdapterWithPlainCredentials } from "../adapters";
import { getProviderCredentials } from "../infra/token-utils";
import { providerInfo } from "../config/provider-info";
import { metricsCollector } from "../infra/metrics";
import https from "https";
import fs from "fs";
import path from "path";

/**
 * Helper to get OAuth scopes from Banco do Brasil via introspection
 */
async function getBancoDoBrasilScopes(credentials: any): Promise<string[]> {
  try {
    // Try to request token with introspection scope
    const INTROSPECTION_SCOPES = ["extrato-info", "oauth.introspeccao"];
    const EXTRATO_SCOPES = ["extrato-info"];

    // Setup mTLS agent if certificates are available
    let httpsAgent: https.Agent | undefined;
    if (!credentials.sandbox) {
      try {
        let cert: string | Buffer;
        let key: string | Buffer;

        // Try to get certificates from credentials first, then from files
        if (credentials.cert && credentials.cert_key) {
          cert = credentials.cert;
          key = credentials.cert_key;
          console.error('[BB Introspection] Using mTLS certificates from credentials');
        } else {
          // Fallback: read from files
          const certsDir = path.join(process.cwd(), 'certs');
          const certPath = path.join(certsDir, 'certificate.crt');
          const keyPath = path.join(certsDir, 'private.key');

          if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
            cert = fs.readFileSync(certPath);
            key = fs.readFileSync(keyPath);
            console.error('[BB Introspection] Using mTLS certificates from files');
          } else {
            console.error('[BB Introspection] ⚠️  No mTLS certificates found, introspection may fail');
            return EXTRATO_SCOPES; // Return fallback early
          }
        }

        httpsAgent = new https.Agent({
          cert,
          key,
          rejectUnauthorized: false
        });
      } catch (error) {
        console.error('[BB Introspection] Failed to setup mTLS:', error);
        return EXTRATO_SCOPES; // Return fallback on error
      }
    }

    // Get OAuth token first
    const tokenUrl = credentials.sandbox
      ? "https://oauth.hm.bb.com.br/oauth/token"
      : "https://oauth.bb.com.br/oauth/token";

    const authString = Buffer.from(
      `${credentials.client_id}:${credentials.client_secret}`
    ).toString("base64");

    const params = new URLSearchParams();
    params.append("grant_type", "client_credentials");
    params.append("scope", INTROSPECTION_SCOPES.join(" "));

    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
      ...(httpsAgent && { agent: httpsAgent })
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      console.error(`[BB Introspection] Token request failed: ${tokenResponse.status}`);
      console.error(`[BB Introspection] Error response:`, errorText);
      console.error(`[BB Introspection] 💡 App may not have oauth.introspeccao scope registered`);
      return EXTRATO_SCOPES; // Fallback
    }

    const tokenData = await tokenResponse.json() as any;
    const accessToken = tokenData.access_token;
    const grantedScope = tokenData.scope || "";
    console.error(`[BB Introspection] ✅ Token obtained successfully`);
    console.error(`[BB Introspection] Granted scopes: ${grantedScope}`);

    // If the app doesn't have oauth.introspeccao scope, return the granted scopes directly
    if (grantedScope && !grantedScope.includes("oauth.introspeccao")) {
      const scopes = grantedScope.split(" ").filter((s: string) => s.length > 0);
      console.error(`[BB Introspection] ℹ️  App doesn't have oauth.introspeccao scope, using granted scopes directly`);
      return scopes;
    }

    // Introspect token to get scopes
    const introspectionUrl = credentials.sandbox
      ? "https://oauth.hm.bb.com.br/oauth/introspect"
      : "https://oauth.bb.com.br/oauth/introspect";

    const introspectParams = new URLSearchParams();
    introspectParams.append("token", accessToken);
    introspectParams.append("token_type_hint", "access_token");

    const introspectResponse = await fetch(introspectionUrl, {
      method: "POST",
      headers: {
        "Authorization": `Basic ${authString}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: introspectParams.toString(),
      ...(httpsAgent && { agent: httpsAgent })
    });

    if (!introspectResponse.ok) {
      const errorText = await introspectResponse.text();
      console.error(`[BB Introspection] Introspection failed: ${introspectResponse.status}`);
      console.error(`[BB Introspection] Error response:`, errorText);
      console.error(`[BB Introspection] ⚠️  Note: Introspection requires 'oauth.introspeccao' scope`);
      console.error(`[BB Introspection] 💡 Recommendation: Add 'scopes' field to JWT credentials to avoid introspection`);
      return EXTRATO_SCOPES; // Fallback
    }

    const introspectionData = await introspectResponse.json() as any;

    if (introspectionData.active && introspectionData.scope) {
      const scopes = introspectionData.scope.split(" ");
      console.error(`[BB Introspection] ✅ Scopes detected: ${scopes.join(", ")}`);
      return scopes;
    }

    return EXTRATO_SCOPES; // Fallback
  } catch (error) {
    console.error("[BB Introspection] Error:", error);
    return ["extrato-info"]; // Safe fallback
  }
}

class MCPChargeServer {
  private server: Server;
  private contextCompany?: string;
  private contextProviderId?: string;
  private contextCredentials?: Record<string, any>;

  constructor() {
    this.server = new Server(
      {
        name: "mcp-maax-cob",
        version: "2.0.0",
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
    this.setupToolHandlers();
  }

  private setupRequestHandlers() {
    this.server.setRequestHandler(InitializeRequestSchema, async () => {
      return {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: { listChanged: true }
        },
        serverInfo: {
          name: "mcp-maax-cob",
          version: "2.0.0"
        }
      };
    });

    this.server.setRequestHandler(ListToolsRequestSchema, async (request) => {
      console.error('[MCP] 🔧 ListTools request recebido');

      // Discover which tools are available based on provider capabilities
      const availableTools = await this.discoverAvailableTools();

      return {
        tools: availableTools
      };
    });
  }

  /**
   * Dynamically discover which tools are available based on provider capabilities
   * This method is called by the transport layer during tools/list requests
   * @param credentials - Provider credentials from JWT token (optional, for capability check)
   */
  public async discoverAvailableTools(credentials?: Record<string, any>) {
    // Get provider from token/context
    const providerId = this.getProviderFromContext() || 'banco_do_brasil';

    // Build dynamic tools based on provider and credentials
    const allTools = [
          {
            name: "get_providers_metadata",
            description: "Obter metadados de todos os provedores disponíveis",
            inputSchema: {
              type: "object",
              properties: {},
              additionalProperties: false
            }
          },
          {
            name: providerId === 'banco_do_brasil' ? 'extrato_conta_corrente' : 'get_account_statement',
            description: providerId === 'banco_do_brasil'
              ? 'Obtém extrato de conta corrente - Banco do Brasil (GET /extratos/v1/conta-corrente/agencia/{agencia}/conta/{conta})'
              : `Obtém extrato bancário do ${providerId}`,
            inputSchema: {
              type: "object",
              properties: {
                numeroPaginaSolicitacao: { type: "integer", description: "Número da página (opcional)" },
                quantidadeRegistroPaginaSolicitacao: { type: "integer", description: "Quantidade de registros por página (50-200)" },
                dataInicioSolicitacao: { type: "string", description: "Data inicial no formato DDMMAAAA" },
                dataFimSolicitacao: { type: "string", description: "Data final no formato DDMMAAAA" }
              },
              additionalProperties: false
            }
          },
          {
            name: "create_charge",
            description: "Cria uma cobrança/unificação boleto/pix via MCP",
            inputSchema: {
              type: "object",
              properties: {
                provider_id: { type: "string", description: "ID do provedor (cora, sicredi, itau, banco_do_brasil)" },
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
                }
              },
              required: ["provider_id", "amount", "due_date", "payment_methods", "customer"]
            }
          },
          {
            name: "retrieve_charge",
            description: "Consulta uma cobrança por ID do provedor",
            inputSchema: {
              type: "object",
              properties: {
                provider_id: { type: "string", description: "ID do provedor" },
                provider_charge_id: { type: "string", description: "ID da cobrança no provedor" }
              },
              required: ["provider_id", "provider_charge_id"]
            }
          },
          {
            name: "cancel_charge",
            description: "Cancela uma cobrança",
            inputSchema: {
              type: "object",
              properties: {
                provider_id: { type: "string", description: "ID do provedor" },
                provider_charge_id: { type: "string", description: "ID da cobrança no provedor" }
              },
              required: ["provider_id", "provider_charge_id"]
            }
          },
          {
            name: "apply_instruction",
            description: "Aplica instruções (ex.: mudança de vencimento)",
            inputSchema: {
              type: "object",
              properties: {
                provider_id: { type: "string", description: "ID do provedor" },
                provider_charge_id: { type: "string", description: "ID da cobrança no provedor" },
                instruction_type: { type: "string", description: "Tipo de instrução" },
                parameters: { type: "object", description: "Parâmetros da instrução" }
              },
              required: ["provider_id", "provider_charge_id", "instruction_type"]
            }
          }
        ];

    // Try to get adapter and check capabilities
    try {
      // Get provider from token/context (default to banco_do_brasil for testing)
      const providerId = this.getProviderFromContext() || 'banco_do_brasil';

      // Skip capability discovery if no credentials provided (stateless mode)
      if (!credentials) {
        console.error('[MCP] ⚠️  No credentials provided for capability discovery, returning all tools');
        return allTools;
      }

      // Debug: log credentials structure
      console.error('[MCP] 🔍 Credentials received:', JSON.stringify(credentials, null, 2));

      // For Banco do Brasil, check scopes
      if (providerId === 'banco_do_brasil') {
        let scopes: string[] = [];

        // Check if scopes are explicitly provided in credentials
        if (credentials.scopes && Array.isArray(credentials.scopes)) {
          scopes = credentials.scopes as string[];
          console.error('[MCP] 🔍 Using scopes from credentials');
        } else {
          // If no scopes in credentials, try OAuth introspection (requires oauth.introspeccao scope)
          // IMPORTANT: Introspection will fail if the app doesn't have 'oauth.introspeccao' scope
          // Best practice: Add 'scopes' field to JWT credentials to avoid introspection
          // Example JWT payload:
          // {
          //   "credentials": {
          //     "scopes": ["extrato-info", "cobrancas-requisicao", "cobrancas-info", ...]
          //   }
          // }
          console.error('[MCP] ⚠️  No scopes in credentials, performing OAuth introspection...');
          scopes = await getBancoDoBrasilScopes(credentials);
        }

        // Continue with scope-based filtering
        const CHARGE_SCOPES = ["cobrancas-requisicao", "cobrancas-info", "cobrancas-boletos-requisicao", "cobrancas-boletos-info"];
        const EXTRATO_SCOPES = ["extrato-info"];

        const canCreateCharges = CHARGE_SCOPES.every(s => scopes.includes(s));
        const canGetStatements = EXTRATO_SCOPES.every(s => scopes.includes(s));

        console.error(`[MCP] 🔍 Scope-based capability discovery for ${providerId}:`);
        console.error(`  - Available scopes: ${scopes.join(", ")}`);
        console.error(`  - canCreateCharges: ${canCreateCharges}`);
        console.error(`  - canGetStatements: ${canGetStatements}`);

        // Filter tools based on scopes
        const filteredTools = allTools.filter(tool => {
          // Always include metadata tool
          if (tool.name === 'get_providers_metadata') return true;

          // Include statement tool only if provider supports it
          if (tool.name === 'get_account_statement') return canGetStatements;

          // Include charge tools only if provider supports them
          if (['create_charge', 'retrieve_charge', 'cancel_charge', 'apply_instruction'].includes(tool.name)) {
            return canCreateCharges;
          }

          return true;
        });

        console.error(`[MCP] ✅ Filtered ${allTools.length} tools -> ${filteredTools.length} tools based on scopes`);
        return filteredTools;
      }

      console.error('[MCP] ⚠️  No scopes found in credentials for scope-based discovery');
    } catch (error) {
      console.error('[MCP] ⚠️  Capability discovery failed:', error);
    }

    // Fallback: return all tools if capability discovery fails
    console.error('[MCP] ⚠️  Using fallback - returning all tools');
    return allTools;
  }

  /**
   * Get provider ID from context (e.g., from JWT token in HTTP transport)
   */
  private getProviderFromContext(): string | undefined {
    return this.contextProviderId;
  }

  /**
   * Set company from external context (called by transport layer)
   * SECURITY: This ensures all operations are scoped to a specific company
   */
  public setCompanyContext(company: string) {
    this.contextCompany = company;
    console.error(`[MCP] 🔒 Company context set: ${company}`);
  }

  /**
   * Set provider ID from external context (called by transport layer)
   */
  public setProviderContext(providerId: string) {
    this.contextProviderId = providerId;
  }

  /**
   * Set credentials from external context (called by transport layer)
   */
  public setCredentialsContext(credentials: Record<string, any>) {
    this.contextCredentials = credentials;
  }

  private setupToolHandlers() {
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      try {
        switch (name) {
          case "get_providers_metadata":
            return await this.handleGetProvidersMetadata();
          case "get_account_statement":
          case "extrato_conta_corrente":
            return await this.handleGetAccountStatement(args);
          case "create_charge":
            return await this.handleCreateCharge(args);
          case "retrieve_charge":
            return await this.handleRetrieveCharge(args);
          case "cancel_charge":
            return await this.handleCancelCharge(args);
          case "apply_instruction":
            return await this.handleApplyInstruction(args);
          default:
            throw new McpError(
              ErrorCode.MethodNotFound,
              `Unknown tool: ${name}`
            );
        }
      } catch (error) {
        if (error instanceof McpError) {
          throw error;
        }

        throw new McpError(
          ErrorCode.InternalError,
          `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });
  }

  public async handleGetProvidersMetadata() {
    const metadata = {
      providers: providerInfo.map((info) => ({
        id: info.id,
        name: info.name,
        description: info.description,
        supported_methods: info.paymentMethods,
        supports_cancellation: info.operations.cancelCharge,
        cancel_methods: info.operations.cancelMethods ?? [],
        operations: info.operations,
        auth_methods: info.authMethods,
        required_credentials: info.requiredCredentials,
        api_endpoints: info.apiEndpoints ?? undefined
      }))
    };

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(metadata, null, 2)
        }
      ]
    };
  }

  public async handleGetAccountStatement(args: any) {
    // SECURITY: Validate company context is set
    if (!this.contextCompany) {
      console.error('[MCP] ❌ SECURITY: Attempt to call handleGetAccountStatement without company');
      throw new McpError(ErrorCode.InvalidParams, "Company context required for all operations");
    }

    // Get provider from context (set by JWT)
    const providerId = this.getProviderFromContext();

    if (!providerId) {
      throw new McpError(ErrorCode.InvalidParams, "provider_id not found in context");
    }

    console.error(`[MCP] 🔒 handleGetAccountStatement - Company: ${this.contextCompany}, Provider: ${providerId}`);

    const provider = providerInfo.find((info) => info.id === providerId);

    if (!provider || provider.operations?.getStatement !== true) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Provider ${providerId} does not support account statements`
      );
    }

    // Try to get credentials from context first (JWT), then fallback to env
    let credentials: Record<string, any>;
    if (this.contextCredentials) {
      credentials = this.contextCredentials;
      console.error('[MCP] Using credentials from JWT context');
    } else {
      credentials = getProviderCredentials(providerId);
      console.error('[MCP] Using credentials from environment');
    }

    // Extract agency and account from credentials
    // Expected JWT format for Banco do Brasil:
    // {
    //   "agency": "4733-3",        // Agência com dígito
    //   "account": "15032-0",      // Conta com dígito
    //   "convenio": "2861488",     // Convênio (para cobrança)
    //   "account_type": "conta_corrente"
    // }
    let agency = credentials.agency;
    let account = credentials.account || credentials.account_number;

    // Fallback: If account_number contains a slash, split it (format: agency/account)
    if (!agency && credentials.account_number && credentials.account_number.includes('/')) {
      const parts = credentials.account_number.split('/');
      agency = parts[0];
      account = parts[1];
      console.error(`[MCP] Parsed account_number format: agency=${agency}, account=${account}`);
    }

    if (!agency || !account) {
      throw new McpError(
        ErrorCode.InvalidParams,
        `Missing agency or account in credentials. Required JWT format: { "agency": "XXXX-X", "account": "XXXXX-X" }. Found: agency=${agency}, account=${account}`
      );
    }

    console.error(`[MCP] ✅ Using agency=${agency}, account=${account} from credentials`);

    // Query parameters come from user args
    const query = (args ?? {}) as Record<string, any>;

    // Create adapter - use plain credentials function if from JWT context
    const adapter = this.contextCredentials
      ? getAdapterWithPlainCredentials(providerId, credentials, {})
      : getAdapter(providerId, JSON.stringify(credentials), JSON.stringify({}));

    if (!adapter.getAccountStatement) {
      throw new McpError(
        ErrorCode.InternalError,
        `Adapter for ${providerId} does not implement account statements`
      );
    }

    metricsCollector.incrementProviderCounter(providerId, "requests");

    try {
      const statement = await adapter.getAccountStatement({
        providerId,
        agency,
        account,
        query: {
          page: query.page ?? query.numeroPaginaSolicitacao,
          pageSize: query.page_size ?? query.quantidadeRegistroPaginaSolicitacao,
          startDate: query.start_date ?? query.dataInicioSolicitacao,
          endDate: query.end_date ?? query.dataFimSolicitacao,
          appKey: query.app_key ?? query.appKey ?? query.gwDevAppKey ?? query["gw-dev-app-key"]
        }
      });

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              data: statement.data,
              raw: statement.raw
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      metricsCollector.incrementProviderCounter(providerId, "errors");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      };
    }
  }

  public async handleCreateCharge(args: any) {
    const { provider_id, ...chargeData } = args;

    try {
      const credentials = getProviderCredentials(provider_id);
      const credentialsJson = JSON.stringify(credentials);
      const configJson = JSON.stringify({});
      const adapter = getAdapter(provider_id, credentialsJson, configJson);

      metricsCollector.incrementProviderCounter(provider_id, "requests");

      const result = await adapter.createCharge({
        tenantId: "stateless",
        providerId: provider_id,
        ...chargeData
      });

      metricsCollector.incrementCounter("charges_created_total");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              provider_charge_id: result.provider_charge_id,
              data: result.data
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      metricsCollector.incrementProviderCounter(provider_id, "errors");
      metricsCollector.incrementCounter("charges_failed_total");

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      };
    }
  }

  public async handleRetrieveCharge(args: any) {
    const { provider_id, provider_charge_id } = args;

    try {
      const credentials = getProviderCredentials(provider_id);
      const credentialsJson = JSON.stringify(credentials);
      const configJson = JSON.stringify({});
      const adapter = getAdapter(provider_id, credentialsJson, configJson);

      const result = await adapter.retrieveCharge(provider_charge_id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              status: result.status,
              data: result.data
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      };
    }
  }

  public async handleCancelCharge(args: any) {
    const { provider_id, provider_charge_id } = args;

    try {
      const credentials = getProviderCredentials(provider_id);
      const credentialsJson = JSON.stringify(credentials);
      const configJson = JSON.stringify({});
      const adapter = getAdapter(provider_id, credentialsJson, configJson);

      const result = await adapter.cancelCharge({
        tenantId: "stateless",
        providerId: provider_id,
        chargeId: provider_charge_id,
        providerChargeId: provider_charge_id
      });

      if (result.success) {
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                success: true,
                data: result.data ?? {}
              }, null, 2)
            }
          ]
        };
      }

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: result.error ?? "Unknown cancellation failure"
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            }, null, 2)
          }
        ]
      };
    }
  }

  public async handleApplyInstruction(args: any) {
    return {
      content: [
        {
          type: "text",
          text: JSON.stringify({
            success: false,
            error: "apply_instruction not implemented"
          }, null, 2)
        }
      ]
    };
  }

  public getServer() {
    return this.server;
  }

  public async start() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

export { MCPChargeServer };

import { FastifyInstance } from "fastify";
import { InitializeProviderRequest } from "../schemas";
import { createProvider, requireTenantByAdminKey } from "../../infra/db";
import { getAdminKey } from "../auth";
import { encryptJson } from "../../infra/crypto";

export default async function routes(app: FastifyInstance) {
  app.post("/v1/admin/providers", async (req, reply) => {
    const adminKey = getAdminKey(req);
    if (!adminKey) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Missing admin key" });
    const tenantId = await requireTenantByAdminKey(adminKey);
    if (!tenantId) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Invalid admin key" });

    const parsed = InitializeProviderRequest.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error_code: "VALIDATION_ERROR", message: parsed.error.message });
    }
    const { provider_type, friendly_name, credentials, provider_specific_config } = parsed.data;
    const credentials_encrypted = encryptJson(credentials);
    const config_encrypted = encryptJson(provider_specific_config);
    const provider_id = await createProvider(tenantId, provider_type, friendly_name, credentials_encrypted, config_encrypted);
    reply.code(201).send({ provider_id });
  });
}

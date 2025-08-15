import { FastifyInstance } from "fastify";
import { createPublicKey, requireTenantByAdminKey } from "../../infra/db";
import { getAdminKey } from "../auth";

export default async function routes(app: FastifyInstance) {
  app.post("/v1/admin/api-keys", async (req, reply) => {
    const adminKey = getAdminKey(req);
    if (!adminKey) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Missing admin key" });
    const tenantId = await requireTenantByAdminKey(adminKey);
    if (!tenantId) return reply.code(401).send({ error_code: "AUTH_INVALID_KEY", message: "Invalid admin key" });

    const api_key = await createPublicKey(tenantId);
    reply.code(201).send({ api_key });
  });
}

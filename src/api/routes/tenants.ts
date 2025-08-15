import { FastifyInstance } from "fastify";
import { initTenant } from "../../infra/db";

export default async function routes(app: FastifyInstance) {
  app.post("/v1/tenants/init", async (req, reply) => {
    const res = await initTenant();
    reply.code(201).send(res);
  });
}

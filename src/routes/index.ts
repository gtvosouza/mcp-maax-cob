import type { FastifyInstance } from "fastify";
import registerInitializeRoute from "./initialize";
import { registerChargeRoutes } from "./charges";

export async function registerRoutes(app: FastifyInstance): Promise<void> {
  await registerInitializeRoute(app);
  await registerChargeRoutes(app);
}

import { FastifyRequest } from "fastify";

export function getAdminKey(req: FastifyRequest): string | null {
  const v = req.headers["x-admin-api-key"];
  return typeof v === "string" ? v : null;
}
export function getPublicKey(req: FastifyRequest): string | null {
  const v = req.headers["x-public-api-key"];
  return typeof v === "string" ? v : null;
}

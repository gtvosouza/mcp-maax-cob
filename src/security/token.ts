import jwt from "jsonwebtoken";
import { z, ZodError } from "zod";
import { providerIdSchema, providerCredentialSchemas, type ProviderId } from "../config/provider-credentials";
import { validateProviderCredentials } from "../config/provider-credentials";

const tokenMetaSchema = z
  .object({
    ttlSeconds: z.number().int().positive().max(60 * 60 * 24).optional(),
    cacheEnabled: z.boolean().optional(),
    redisKeyPrefix: z.string().min(1).optional()
  })
  .optional();

const basePayloadSchema = z.object({
  providerId: providerIdSchema,
  credentials: z.unknown(),
  company: z.string().min(1).optional(),
  tenantId: z.string().min(1).optional(), // Mantém para retrocompatibilidade
  meta: tokenMetaSchema,
  context: z.record(z.unknown()).optional(),
  iat: z.number().optional(),
  exp: z.number().optional()
});

export type TokenMeta = z.infer<NonNullable<typeof tokenMetaSchema>>;

export type ProviderCredentialsMap = {
  [K in ProviderId]: z.infer<(typeof providerCredentialSchemas)[K]>;
};

export type TokenPayload = {
  [K in ProviderId]: {
    providerId: K;
    credentials: ProviderCredentialsMap[K];
    company?: string;
    tenantId?: string; // Mantém para retrocompatibilidade
    meta?: TokenMeta;
    context?: Record<string, unknown>;
    iat?: number;
    exp?: number;
  };
}[ProviderId];

export class TokenVerificationError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = "TokenVerificationError";
  }
}

function normalizeZodError(error: ZodError) {
  return error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message
  }));
}

export function verifyInitializeToken(token: string, secret: string): TokenPayload {
  try {
    const decoded = jwt.verify(token, secret);

    if (typeof decoded === "string") {
      throw new TokenVerificationError("Token payload must be an object");
    }

    const base = basePayloadSchema.parse(decoded);
    const validatedCredentials = validateProviderCredentials(base.providerId, base.credentials);

    return {
      ...base,
      credentials: validatedCredentials
    } as TokenPayload;
  } catch (error) {
    if (error instanceof TokenVerificationError) {
      throw error;
    }

    if (error instanceof ZodError) {
      throw new TokenVerificationError("Invalid initialize token payload", normalizeZodError(error));
    }

    if (error instanceof jwt.TokenExpiredError) {
      throw new TokenVerificationError("Initialize token has expired", error);
    }

    throw new TokenVerificationError("Invalid initialize token", error);
  }
}

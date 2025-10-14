import { config } from "dotenv";
import { z } from "zod";

config();

const envSchema = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().positive().default(3000),
    HOST: z.string().default("0.0.0.0"),
    LOG_LEVEL: z.string().default("info"),
    MCP_TOKEN_SECRET: z.string().min(1).default("change-me"),
    RATE_LIMIT: z.coerce.number().int().positive().default(120),
    ENCRYPTION_KEY_HEX: z.string().optional(),
    WEBHOOK_HMAC_SECRET: z.string().default("change-me"),
    REDIS_URL: z.string().default("redis://localhost:6379"),
    REDIS_PASSWORD: z.string().optional()
  })
  .transform((value) => ({
    ...value,
    isProduction: value.NODE_ENV === "production"
  }));

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("Invalid environment configuration", parsed.error.flatten().fieldErrors);
  throw new Error("Invalid environment variables");
}

const values = parsed.data;

if (values.isProduction) {
  const missing: string[] = [];
  if (!values.ENCRYPTION_KEY_HEX) missing.push("ENCRYPTION_KEY_HEX");
  if (!values.WEBHOOK_HMAC_SECRET || values.WEBHOOK_HMAC_SECRET === "change-me") {
    missing.push("WEBHOOK_HMAC_SECRET");
  }
  if (!values.MCP_TOKEN_SECRET || values.MCP_TOKEN_SECRET === "change-me") {
    missing.push("MCP_TOKEN_SECRET");
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables in production: ${missing.join(", ")}`);
  }
}

export const env = {
  port: values.PORT,
  host: values.HOST,
  nodeEnv: values.NODE_ENV,
  logLevel: values.LOG_LEVEL,
  mcpTokenSecret: values.MCP_TOKEN_SECRET,
  encryptionKeyHex: values.ENCRYPTION_KEY_HEX || "",
  webhookHmacSecret: values.WEBHOOK_HMAC_SECRET,
  rateLimit: values.RATE_LIMIT,
  isProduction: values.isProduction,
  isDevelopment: values.NODE_ENV === "development",
  redis: {
    url: values.REDIS_URL,
    password: values.REDIS_PASSWORD || ""
  }
};

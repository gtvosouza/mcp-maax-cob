import crypto from "node:crypto";
import { env } from "../env";

/**
 * Minimal AES-256-GCM helpers to store secrets encrypted at-rest.
 * NOTE: Replace with KMS/Vault in production.
 */

const key = Buffer.from(env.encryptionKeyHex, "hex");
if (key.length !== 32) {
  console.warn("[crypto] ENCRYPTION_KEY_HEX not set to 32 bytes (hex). Using insecure zero key for demo.");
}

export function encryptJson(obj: unknown): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const json = Buffer.from(JSON.stringify(obj), "utf8");
  const enc = Buffer.concat([cipher.update(json), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptJson<T = unknown>(b64: string): T {
  const buf = Buffer.from(b64, "base64");
  const iv = buf.subarray(0, 12);
  const tag = buf.subarray(12, 28);
  const enc = buf.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const json = Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
  return JSON.parse(json) as T;
}

export function signHmacSha256(raw: Buffer | string): string {
  const mac = crypto.createHmac("sha256", env.webhookHmacSecret).update(raw).digest("hex");
  return `sha256=${mac}`;
}

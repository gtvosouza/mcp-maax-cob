import { Client } from "pg";
import { env } from "../env";
import { randomUUID } from "node:crypto";

// Minimal SQL helpers for MVP without ORM.
const client = new Client({
  host: env.pg.host,
  port: env.pg.port,
  database: env.pg.database,
  user: env.pg.user,
  password: env.pg.password,
});
await client.connect();

// Create tables if not exist (MVP bootstrap)
await client.query(`
CREATE TABLE IF NOT EXISTS tenants (
  id UUID PRIMARY KEY,
  name VARCHAR(255),
  admin_api_key VARCHAR(255) NOT NULL
);
CREATE TABLE IF NOT EXISTS providers (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_type VARCHAR(50) NOT NULL,
  friendly_name VARCHAR(255) NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  provider_specific_config_encrypted TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS api_keys (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  key VARCHAR(255) NOT NULL,
  key_type VARCHAR(20) NOT NULL
);
CREATE TABLE IF NOT EXISTS charges (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  provider_id UUID NOT NULL,
  provider_charge_id VARCHAR(255),
  reference_id VARCHAR(255),
  status VARCHAR(20) NOT NULL,
  amount INTEGER NOT NULL,
  due_date DATE NOT NULL,
  paid_at TIMESTAMP,
  paid_amount INTEGER,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id UUID PRIMARY KEY,
  tenant_id UUID NOT NULL,
  url VARCHAR(500) NOT NULL,
  webhook_secret VARCHAR(255) NOT NULL,
  enabled_events JSONB NOT NULL,
  is_active BOOLEAN DEFAULT true
);
`);

export { client };

export async function initTenant() {
  const id = randomUUID();
  const adminKey = "sk_admin_" + randomUUID().replace(/-/g, "");
  await client.query("INSERT INTO tenants (id, name, admin_api_key) VALUES ($1,$2,$3)", [id, null, adminKey]);
  return { tenant_id: id, admin_api_key: adminKey };
}

export async function requireTenantByAdminKey(adminKey: string) {
  const r = await client.query("SELECT id FROM tenants WHERE admin_api_key = $1", [adminKey]);
  if (!r.rowCount) return null;
  return r.rows[0].id as string;
}

export async function requireTenantByPublicKey(publicKey: string) {
  const r = await client.query("SELECT tenant_id FROM api_keys WHERE key = $1 AND key_type='public'", [publicKey]);
  if (!r.rowCount) return null;
  return r.rows[0].tenant_id as string;
}

export async function createProvider(tenantId: string, provider_type: string, friendly_name: string, credentials_encrypted: string, provider_specific_config_encrypted: string) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO providers (id, tenant_id, provider_type, friendly_name, credentials_encrypted, provider_specific_config_encrypted) VALUES ($1,$2,$3,$4,$5,$6)",
    [id, tenantId, provider_type, friendly_name, credentials_encrypted, provider_specific_config_encrypted]
  );
  return id;
}

export async function createPublicKey(tenantId: string) {
  const id = randomUUID();
  const key = "pk_" + randomUUID().replace(/-/g, "");
  await client.query("INSERT INTO api_keys (id, tenant_id, key, key_type) VALUES ($1,$2,$3,$4)", [id, tenantId, key, "public"]);
  return key;
}

export async function getProvider(tenantId: string, providerId: string) {
  const r = await client.query("SELECT * FROM providers WHERE id=$1 AND tenant_id=$2", [providerId, tenantId]);
  return r.rowCount ? r.rows[0] : null;
}

export async function insertCharge(tenantId: string, providerId: string, payload: any) {
  const id = randomUUID();
  await client.query(
    "INSERT INTO charges (id, tenant_id, provider_id, status, amount, due_date, reference_id, data) VALUES ($1,$2,$3,'PENDING',$4,$5,$6,$7::jsonb)",
    [id, tenantId, providerId, payload.amount, payload.due_date, payload.reference_id || null, JSON.stringify({})]
  );
  return id;
}

export async function getCharge(tenantId: string, id: string) {
  const r = await client.query("SELECT * FROM charges WHERE id=$1 AND tenant_id=$2", [id, tenantId]);
  return r.rowCount ? r.rows[0] : null;
}

export async function listCharges(tenantId: string, limit: number) {
  const r = await client.query("SELECT * FROM charges WHERE tenant_id=$1 ORDER BY created_at DESC NULLS LAST, id DESC LIMIT $2", [tenantId, limit]);
  return r.rows;
}

export async function setChargeData(tenantId: string, id: string, fields: Partial<{ status: string; provider_charge_id: string; data: any }>) {
  const prev = await getCharge(tenantId, id);
  if (!prev) return false;
  const status = fields.status ?? prev.status;
  const provider_charge_id = fields.provider_charge_id ?? prev.provider_charge_id;
  const data = fields.data ? JSON.stringify(fields.data) : JSON.stringify(prev.data || {});
  await client.query("UPDATE charges SET status=$1, provider_charge_id=$2, data=$3::jsonb WHERE id=$4 AND tenant_id=$5", [status, provider_charge_id, data, id, tenantId]);
  return true;
}

export async function registerWebhook(tenantId: string, url: string, enabled_events: string[], secret: string) {
  const id = randomUUID();
  await client.query("INSERT INTO webhook_endpoints (id, tenant_id, url, enabled_events, webhook_secret, is_active) VALUES ($1,$2,$3,$4::jsonb,$5,true)", [id, tenantId, url, JSON.stringify(enabled_events), secret]);
  return { id, webhook_secret: secret };
}

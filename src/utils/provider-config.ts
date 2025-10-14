export function extractProviderConfig(
  context: Record<string, unknown> | null | undefined
): Record<string, unknown> | null {
  if (!context || typeof context !== "object") {
    return null;
  }

  const contextRecord = context as Record<string, unknown>;
  const candidate =
    contextRecord.providerConfig ?? contextRecord.provider_config ?? null;

  if (candidate && typeof candidate === "object") {
    return candidate as Record<string, unknown>;
  }

  return null;
}

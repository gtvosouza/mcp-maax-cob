export function extractBearerToken(header?: string | null): string | null {
  if (!header) {
    return null;
  }

  const [scheme, token] = header.split(" ");
  if (!token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token.trim() || null;
}

import { randomUUID, randomBytes, createHash } from 'node:crypto';

// Refresh token shape: `${sessionId}.${secret}`. sessionId is not secret —
// it just lets refreshSession() find the row without a session-context
// query (Doc 05 §6 chicken-and-egg: you need the row to know who you are).
// Only sha256(secret) is ever persisted (`sessions.refresh_hash`).

export function newSessionId(): string {
  return randomUUID();
}

export function newOpaqueSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function hashSecret(secret: string): string {
  return createHash('sha256').update(secret).digest('hex');
}

export function formatRefreshToken(sessionId: string, secret: string): string {
  return `${sessionId}.${secret}`;
}

export function parseRefreshToken(token: string): { sessionId: string; secret: string } {
  const dot = token.indexOf('.');
  if (dot < 0) throw new Error('[identity-auth] Malformed refresh token.');
  return { sessionId: token.slice(0, dot), secret: token.slice(dot + 1) };
}

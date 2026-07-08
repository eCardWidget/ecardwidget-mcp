import { randomBytes } from "node:crypto";

/**
 * Two-phase confirmation for destructive tools. A tool's first call (no token)
 * returns a dry-run preview plus a one-time token bound to a *fingerprint* of
 * the exact operation (e.g. `send_campaign:42`). The second call must present
 * that token AND the same operation — so a token can't be replayed against a
 * different target. Tokens are one-time and expire after 5 minutes.
 *
 * This lives at the tool layer so it works in every MCP client, independent of
 * whether the client supports elicitation.
 */

const TTL_MS = 5 * 60 * 1000;

interface Pending {
  fingerprint: string;
  expiresAt: number;
}

const store = new Map<string, Pending>();

export function issueConfirmToken(fingerprint: string): string {
  const token = randomBytes(9).toString("base64url"); // ~12 url-safe chars
  store.set(token, { fingerprint, expiresAt: Date.now() + TTL_MS });
  return token;
}

/**
 * Validate + consume a token for a given operation. One-time: any attempt burns
 * the token (so a wrong-target guess can't be retried).
 */
export function useConfirmToken(token: string, fingerprint: string): { ok: boolean; reason?: string } {
  const pending = store.get(token);
  if (!pending) return { ok: false, reason: "unknown or already-used confirmation token" };
  store.delete(token);
  if (Date.now() > pending.expiresAt) {
    return { ok: false, reason: "the confirmation token expired (valid 5 minutes) — request a fresh preview" };
  }
  if (pending.fingerprint !== fingerprint) {
    return { ok: false, reason: "the confirmation token does not match this action" };
  }
  return { ok: true };
}

/** Test-only: reset the store. */
export function _resetConfirmStore(): void {
  store.clear();
}

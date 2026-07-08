/** The 12 eCardWidget feature areas (must match the server's SecureHelpers area set). */
export type Area =
  | "ecards"
  | "widgets"
  | "automations"
  | "campaigns"
  | "directory"
  | "gift_cards"
  | "reports"
  | "sso"
  | "developer"
  | "whitelabel"
  | "billing"
  | "ecommerce";

export type Level = "none" | "view" | "manage";

/** Shape of GET /v2/api/key/info (the `data` block). */
export interface KeyInfo {
  key: { label: string; full_access: boolean; is_session: boolean };
  permissions: Record<string, Level>;
  /** Flattened "<area>:read" / "<area>:write" capability strings. */
  capabilities: string[];
  rate_limit: { per_minute: number };
  usage: { this_hour: number };
  account: { id: number; display_name: string };
}

/** A capability string, e.g. "ecards:read" or "directory:write". */
export type Capability = `${Area}:read` | `${Area}:write`;

export interface EcwConfig {
  apiKey: string;
  baseUrl: string;
}

/** Error thrown by the ECW client for non-2xx responses (mapped to MCP tool errors). */
export class EcwApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = "EcwApiError";
  }
}

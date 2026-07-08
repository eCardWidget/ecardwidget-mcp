import { EcwApiError, type EcwConfig, type KeyInfo } from "./types.js";

/**
 * Thin HTTP client for the eCardWidget API. Authenticates with a scoped API key
 * as a Bearer token (the same key an admin generates in Settings → Developers).
 * The key is NEVER logged. All server-side scope enforcement, throttling, and
 * auditing still apply — this client is just a typed transport.
 */
export class EcwClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;

  constructor(config: EcwConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
  }

  /** GET /v2/api/key/info — the calling key's own scope (drives tool registration). */
  async getKeyInfo(): Promise<KeyInfo> {
    const res = await this.request("GET", "/v2/api/key/info");
    return res.data as KeyInfo;
  }

  async get(path: string, query?: Record<string, string | number | undefined>): Promise<any> {
    return this.request("GET", withQuery(path, query));
  }

  async post(path: string, body?: unknown): Promise<any> {
    return this.request("POST", path, body);
  }

  private async request(method: string, path: string, body?: unknown): Promise<any> {
    const url = `${this.baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;
    let res: Response;
    try {
      res = await fetch(url, {
        method,
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          Accept: "application/json",
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
      });
    } catch (e) {
      // Network / DNS / TLS failure — surface without leaking the key.
      throw new EcwApiError(
        `Could not reach eCardWidget at ${this.baseUrl} (${(e as Error).message}).`,
        0,
      );
    }

    // Respect the per-key throttle (120 req/min by default): surface Retry-After.
    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after")) || 60;
      throw new EcwApiError(
        `Rate limit reached (429). Retry after ~${retry}s. eCardWidget throttles each API key; slow down or batch requests.`,
        429,
        retry,
      );
    }

    const text = await res.text();
    let json: any = undefined;
    try {
      json = text ? JSON.parse(text) : undefined;
    } catch {
      /* non-JSON body */
    }

    if (!res.ok) {
      if (res.status === 401) {
        throw new EcwApiError(
          "Unauthorized (401): the eCardWidget API key is missing, invalid, or revoked. Check ECW_API_KEY.",
          401,
        );
      }
      if (res.status === 403) {
        const msg = json?.messages?.[0] ?? "Forbidden — this key's scope does not permit that action.";
        throw new EcwApiError(`Forbidden (403): ${msg}`, 403);
      }
      const msg = json?.messages?.[0] ?? json?.message ?? `HTTP ${res.status}`;
      throw new EcwApiError(`eCardWidget API error (${res.status}): ${msg}`, res.status);
    }

    return json ?? {};
  }
}

function withQuery(path: string, query?: Record<string, string | number | undefined>): string {
  if (!query) return path;
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== "") params.set(k, String(v));
  }
  const qs = params.toString();
  return qs ? `${path}${path.includes("?") ? "&" : "?"}${qs}` : path;
}

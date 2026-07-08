import { EcwApiError } from "../types.js";
import { errorResult, jsonResult, type EcwTool } from "./registry.js";

/**
 * Always-available introspection tool. Lets the model (and user) see exactly
 * what this connection can do — which account, which areas at which level, the
 * rate limit, and current usage. Backed by GET /v2/api/key/info.
 */
export const whoamiTool: EcwTool = {
  name: "ecw_whoami",
  requires: null,
  register(server, client) {
    server.registerTool(
      "ecw_whoami",
      {
        title: "Who am I / what can I do",
        description:
          "Report the eCardWidget account this connection is authenticated to and the exact " +
          "capabilities of the API key: which feature areas are readable/writable, the request " +
          "rate limit, and usage this hour. Call this first to understand what actions are available.",
        inputSchema: {},
        annotations: { readOnlyHint: true, openWorldHint: true },
      },
      async () => {
        try {
          const info = await client.getKeyInfo();
          return jsonResult({
            account: info.account.display_name || `account #${info.account.id}`,
            access: info.key.full_access ? "full access" : "scoped",
            permissions: info.permissions,
            capabilities: info.capabilities,
            rate_limit_per_minute: info.rate_limit.per_minute,
            usage_this_hour: info.usage.this_hour,
          });
        } catch (e) {
          const msg = e instanceof EcwApiError ? e.message : (e as Error).message;
          return errorResult(msg);
        }
      },
    );
  },
};

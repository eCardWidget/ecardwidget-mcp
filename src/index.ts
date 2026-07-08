import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { EcwClient } from "./client.js";
import { buildServer, SERVER_NAME, SERVER_VERSION } from "./server.js";
import { EcwApiError } from "./types.js";

const DEFAULT_BASE_URL = "https://app.ecardwidget.com";

/**
 * Entry point (stdio transport, for local MCP clients: Claude Desktop, Claude
 * Code, Cursor, etc.). Reads the scoped API key from the environment, introspects
 * its scope via GET /v2/api/key/info, then serves only the authorized tools.
 *
 * Diagnostics go to stderr ONLY — stdout is the MCP JSON-RPC channel and must
 * never be polluted. The API key is never printed.
 */
async function main(): Promise<void> {
  const apiKey = process.env.ECW_API_KEY?.trim();
  const baseUrl = (process.env.ECW_BASE_URL?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");

  if (!apiKey) {
    console.error(
      "[ecardwidget-mcp] Missing ECW_API_KEY. Generate a scoped API key in your dashboard " +
        "(Settings → Developers → API Keys) and set it as the ECW_API_KEY environment variable.",
    );
    process.exit(1);
  }

  const client = new EcwClient({ apiKey, baseUrl });

  // Introspect first — fail fast with a clear message if the key is bad, and
  // learn which tools to expose.
  let keyInfo;
  try {
    keyInfo = await client.getKeyInfo();
  } catch (e) {
    if (e instanceof EcwApiError && e.status === 401) {
      console.error(
        "[ecardwidget-mcp] The ECW_API_KEY was rejected (401). Check that it's a valid, un-revoked key from " +
          `${baseUrl}/s/settings/developers.`,
      );
    } else {
      console.error(`[ecardwidget-mcp] Could not introspect the API key: ${(e as Error).message}`);
    }
    process.exit(1);
  }

  const { server, registered, skipped } = buildServer(client, keyInfo);

  console.error(
    `[ecardwidget-mcp] v${SERVER_VERSION} connected to ${baseUrl} as ` +
      `"${keyInfo.account.display_name || `account #${keyInfo.account.id}`}" ` +
      `(${keyInfo.key.full_access ? "full access" : "scoped"}). ` +
      `${registered.length} tool(s) enabled${skipped.length ? `, ${skipped.length} hidden by scope` : ""}.`,
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((e) => {
  console.error(`[${SERVER_NAME}] fatal: ${(e as Error).message}`);
  process.exit(1);
});

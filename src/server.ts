import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { EcwClient } from "./client.js";
import type { KeyInfo } from "./types.js";
import { ALL_TOOLS } from "./tools/index.js";
import { registerScopedTools } from "./tools/registry.js";

export const SERVER_NAME = "ecardwidget";
export const SERVER_VERSION = "0.3.0";

/**
 * Build an MCP server whose registered tools are exactly those the calling key
 * is scoped for (introspection-driven). Returns the server plus which tools
 * were enabled/skipped so the entry point can log a startup summary to stderr.
 */
export function buildServer(
  client: EcwClient,
  keyInfo: KeyInfo,
): { server: McpServer; registered: string[]; skipped: string[] } {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Tools for managing an eCardWidget account (eCards, widgets, automations, campaigns, " +
        "directory/team members, reports). Only the tools this API key is scoped for are available; " +
        "call ecw_whoami to see the exact capabilities. Destructive actions require a two-step " +
        "confirmation (call once for a dry-run preview + token, then again with the token to execute).",
    },
  );

  const { registered, skipped } = registerScopedTools(server, client, keyInfo, ALL_TOOLS);
  return { server, registered, skipped };
}

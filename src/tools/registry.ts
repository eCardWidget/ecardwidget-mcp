import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { EcwClient } from "../client.js";
import type { Capability, KeyInfo } from "../types.js";

/**
 * A tool that declares the capability it needs. The server registers it ONLY
 * when the calling key's scope includes that capability — so the model never
 * even sees tools the key can't use (great UX + defense-in-depth; the server
 * still enforces scope regardless).
 */
export interface EcwTool {
  name: string;
  /** Required capability, e.g. "campaigns:write". `null` = always available. */
  requires: Capability | null;
  register: (server: McpServer, client: EcwClient) => void;
}

/** Register the tools the key is authorized for; report what was on/off. */
export function registerScopedTools(
  server: McpServer,
  client: EcwClient,
  keyInfo: KeyInfo,
  tools: EcwTool[],
): { registered: string[]; skipped: string[] } {
  const caps = new Set(keyInfo.capabilities);
  const registered: string[] = [];
  const skipped: string[] = [];
  for (const tool of tools) {
    if (tool.requires === null || caps.has(tool.requires)) {
      tool.register(server, client);
      registered.push(tool.name);
    } else {
      skipped.push(tool.name);
    }
  }
  return { registered, skipped };
}

/** Standard success text result. */
export function textResult(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

/** Standard error result (isError=true so the model can react/retry). */
export function errorResult(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true as const };
}

/** JSON result, pretty or compact. */
export function jsonResult(value: unknown, pretty = true) {
  return textResult(JSON.stringify(value, null, pretty ? 2 : 0));
}

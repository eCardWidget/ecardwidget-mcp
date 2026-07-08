import { describe, it, expect, vi } from "vitest";
import { registerScopedTools, type EcwTool } from "./registry.js";
import type { KeyInfo } from "../types.js";

/** Minimal fake McpServer capturing registerTool calls. */
function fakeServer() {
  const registered: string[] = [];
  return {
    registered,
    registerTool: (name: string) => registered.push(name),
  } as any;
}

function keyInfo(capabilities: string[], full = false): KeyInfo {
  return {
    key: { label: "test", full_access: full, is_session: false },
    permissions: {},
    capabilities,
    rate_limit: { per_minute: 120 },
    usage: { this_hour: 0 },
    account: { id: 1, display_name: "Test" },
  };
}

const tools: EcwTool[] = [
  { name: "ecw_whoami", requires: null, register: (s: any) => s.registerTool("ecw_whoami") },
  { name: "ecw_search_ecards", requires: "ecards:read", register: (s: any) => s.registerTool("ecw_search_ecards") },
  { name: "ecw_send_ecard", requires: "ecards:write", register: (s: any) => s.registerTool("ecw_send_ecard") },
  { name: "ecw_list_team_members", requires: "directory:read", register: (s: any) => s.registerTool("ecw_list_team_members") },
];

describe("registerScopedTools (introspection-driven registration)", () => {
  it("always registers null-requires tools (whoami)", () => {
    const server = fakeServer();
    const { registered } = registerScopedTools(server, {} as any, keyInfo([]), tools);
    expect(registered).toContain("ecw_whoami");
  });

  it("hides tools whose capability the key lacks", () => {
    const server = fakeServer();
    // directory:read only → no ecards tools, yes directory list
    const { registered, skipped } = registerScopedTools(server, {} as any, keyInfo(["directory:read"]), tools);
    expect(server.registered).toEqual(["ecw_whoami", "ecw_list_team_members"]);
    expect(registered).toContain("ecw_list_team_members");
    expect(skipped).toContain("ecw_search_ecards");
    expect(skipped).toContain("ecw_send_ecard");
  });

  it("write capability enables the write tool, read-only does not", () => {
    const readOnly = fakeServer();
    registerScopedTools(readOnly, {} as any, keyInfo(["ecards:read"]), tools);
    expect(readOnly.registered).toContain("ecw_search_ecards");
    expect(readOnly.registered).not.toContain("ecw_send_ecard");

    const readWrite = fakeServer();
    registerScopedTools(readWrite, {} as any, keyInfo(["ecards:read", "ecards:write"]), tools);
    expect(readWrite.registered).toContain("ecw_send_ecard");
  });

  it("a full-access key with all capabilities registers everything", () => {
    const server = fakeServer();
    const caps = ["ecards:read", "ecards:write", "directory:read"];
    const { skipped } = registerScopedTools(server, {} as any, keyInfo(caps, true), tools);
    expect(skipped).toHaveLength(0);
    expect(server.registered).toHaveLength(tools.length);
  });
});

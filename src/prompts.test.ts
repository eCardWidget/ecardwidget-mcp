import { describe, it, expect } from "vitest";
import { ALL_PROMPTS, registerScopedPrompts } from "./prompts.js";
import type { KeyInfo } from "./types.js";

function harness() {
  const prompts: Record<string, { config: any; handler: any }> = {};
  const server = {
    registerPrompt: (name: string, config: any, handler: any) => {
      prompts[name] = { config, handler };
    },
  } as any;
  return { server, prompts };
}

const keyInfo = (caps: string[]) => ({ capabilities: caps }) as unknown as KeyInfo;

describe("prompts (scope-gated flow templates)", () => {
  it("registers all flow prompts for a full-access key", () => {
    const h = harness();
    const { registered } = registerScopedPrompts(
      h.server,
      keyInfo(["campaigns:write", "automations:write", "widgets:write", "directory:write"]),
      ALL_PROMPTS,
    );
    expect(registered.sort()).toEqual(["import_directory", "run_campaign", "setup_automation", "spin_up_widget"]);
  });

  it("registers only prompts the key is scoped for", () => {
    const h = harness();
    const { registered, skipped } = registerScopedPrompts(h.server, keyInfo(["campaigns:write"]), ALL_PROMPTS);
    expect(registered).toEqual(["run_campaign"]);
    expect(skipped).toContain("setup_automation");
  });

  it("a prompt returns a guided flow message referencing the real tools + its args", () => {
    const h = harness();
    registerScopedPrompts(h.server, keyInfo(["campaigns:write"]), ALL_PROMPTS);
    const text = h.prompts["run_campaign"]!.handler({ occasion: "Q3 thanks" }).messages[0].content.text as string;
    expect(text).toMatch(/ecw_create_campaign/);
    expect(text).toMatch(/ecw_send_campaign/);
    expect(text).toMatch(/two-step/i);
    expect(text).toMatch(/Q3 thanks/);
  });
});

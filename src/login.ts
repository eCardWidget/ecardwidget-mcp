import * as readline from "node:readline/promises";
import { EcwClient } from "./client.js";
import { loadConfig, saveConfig, clearConfig, configPath } from "./config.js";
import { EcwApiError } from "./types.js";

const DEFAULT_BASE_URL = "https://app.ecardwidget.com";

/** `ecardwidget-mcp login` — get the key, verify it, save it locally. */
export async function runLogin(): Promise<number> {
  const existing = loadConfig();
  const defaultBase = existing.baseUrl || DEFAULT_BASE_URL;

  out("eCardWidget MCP — sign in");
  out(`Generate a scoped API key at: ${defaultBase}/s/settings/developers`);
  out("(Run this in a private terminal — the key is shown as you paste it.)");
  out("");

  const { baseUrl, apiKey } = process.stdin.isTTY
    ? await promptInteractive(defaultBase)
    : await readPiped(defaultBase);

  if (!apiKey) {
    out("No key provided — aborted.");
    return 1;
  }

  const client = new EcwClient({ apiKey, baseUrl });
  try {
    const info = await client.getKeyInfo();
    saveConfig({ apiKey, baseUrl });
    out("");
    out(`✓ Signed in to "${info.account.display_name || "your account"}" (${info.key.full_access ? "full access" : "scoped"}).`);
    out(`  Saved to ${configPath()} (0600).`);
    out("");
    out("Now add it to your MCP client — no key needed in the command:");
    out("  claude mcp add ecardwidget -- npx -y ecardwidget-mcp");
    return 0;
  } catch (e) {
    out("");
    out(`✗ That key could not be verified: ${e instanceof EcwApiError ? e.message : (e as Error).message}`);
    out("  Nothing was saved. Double-check the key (and base URL) and try again.");
    return 1;
  }
}

/** `ecardwidget-mcp logout` — remove the saved key. */
export function runLogout(): number {
  clearConfig();
  out("Signed out — the saved API key was removed.");
  return 0;
}

interface Creds {
  baseUrl: string;
  apiKey: string;
}

async function promptInteractive(defaultBase: string): Promise<Creds> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const baseInput = (await rl.question(`API base URL [${defaultBase}]: `)).trim();
    const apiKey = (await rl.question("Paste your eCardWidget API key: ")).trim();
    return { baseUrl: normalizeBase(baseInput, defaultBase), apiKey };
  } finally {
    rl.close();
  }
}

/** Non-TTY (piped/scripted): read all input, then interpret the lines.
 *  One line → it's the key (default base). Two+ → line 1 = base, line 2 = key. */
async function readPiped(defaultBase: string): Promise<Creds> {
  const raw = await new Promise<string>((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (c) => (data += c));
    process.stdin.on("end", () => resolve(data));
    process.stdin.resume();
  });
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length <= 1) {
    return { baseUrl: defaultBase, apiKey: lines[0] ?? "" };
  }
  return { baseUrl: normalizeBase(lines[0] ?? "", defaultBase), apiKey: lines[1] ?? "" };
}

function normalizeBase(input: string, defaultBase: string): string {
  return (input || defaultBase).replace(/\/+$/, "");
}

// Runs as a normal CLI (NOT the MCP stdio server), so stdout is free to use.
function out(s: string): void {
  process.stdout.write(s + "\n");
}

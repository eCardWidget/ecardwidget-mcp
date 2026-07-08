import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, chmodSync, rmSync } from "node:fs";

/**
 * Local credential store so users don't have to bake the API key into their MCP
 * client config. `ecardwidget-mcp login` writes it here (0600); the server reads
 * it when ECW_API_KEY isn't set in the environment.
 */

export interface StoredConfig {
  apiKey?: string;
  baseUrl?: string;
}

function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || join(homedir(), ".config");
  return join(base, "ecardwidget-mcp");
}

export function configPath(): string {
  return join(configDir(), "config.json");
}

export function loadConfig(): StoredConfig {
  try {
    return JSON.parse(readFileSync(configPath(), "utf8")) as StoredConfig;
  } catch {
    return {};
  }
}

export function saveConfig(cfg: StoredConfig): void {
  mkdirSync(configDir(), { recursive: true });
  const p = configPath();
  writeFileSync(p, JSON.stringify(cfg, null, 2) + "\n", { mode: 0o600 });
  try {
    chmodSync(p, 0o600); // ensure 0600 even if the file pre-existed
  } catch {
    /* best-effort on non-POSIX */
  }
}

export function clearConfig(): void {
  try {
    rmSync(configPath());
  } catch {
    /* nothing to remove */
  }
}

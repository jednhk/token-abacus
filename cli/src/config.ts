import { randomUUID } from "node:crypto";
import { appendFileSync, mkdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export const VERSION = "0.1.0";

/** ~/.token-abacus, overridable for tests. */
export function homeDir(): string {
  const dir = process.env.TOKEN_ABACUS_HOME ?? join(homedir(), ".token-abacus");
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  return dir;
}

export interface Config {
  install_id: string;
  /** Upload finished tasks. Estimates work either way. */
  contribute: boolean;
  /** API base URL override; "mock" for canned responses. */
  api?: string;
}

export function loadConfig(): Config {
  const path = join(homeDir(), "config.json");
  try {
    return JSON.parse(readFileSync(path, "utf8")) as Config;
  } catch {
    // Adding the server to a coding tool is itself the opt-in; `init` asks explicitly.
    const config: Config = { install_id: randomUUID(), contribute: true };
    saveConfig(config);
    return config;
  }
}

export function saveConfig(config: Config): void {
  writeJsonAtomic(join(homeDir(), "config.json"), config);
}

export function writeJsonAtomic(path: string, value: unknown): void {
  const tmp = `${path}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  renameSync(tmp, path);
}

const LOG_LIMIT = 1_000_000;

/** stdout belongs to the MCP protocol: everything else goes to stderr and debug.log. */
export function log(message: string): void {
  const line = `${new Date().toISOString()} [${process.pid}] ${message}\n`;
  process.stderr.write(line);
  try {
    const path = join(homeDir(), "debug.log");
    let size = 0;
    try { size = statSync(path).size; } catch {}
    if (size > LOG_LIMIT) writeFileSync(path, "");
    appendFileSync(path, line);
  } catch {}
}

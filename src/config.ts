import { readFileSync } from "node:fs";
import { DEFAULT_API_BASE } from "./loyverse/client.js";
import { LoyverseConfigError } from "./loyverse/errors.js";

export interface ServerConfig {
  accessToken: string;
  baseUrl: string;
  timeoutMs: number;
}

/**
 * Minimal .env reader for local development. In a real deployment the token
 * arrives through the MCP client's env block or, later, through OAuth.
 */
export function loadDotEnv(path = ".env"): void {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!match) continue;
    const [, key, value] = match;
    if (key && process.env[key] === undefined) {
      process.env[key] = value?.replace(/^["']|["']$/g, "") ?? "";
    }
  }
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): ServerConfig {
  const accessToken = env["LOYVERSE_ACCESS_TOKEN"]?.trim();
  if (!accessToken) {
    throw new LoyverseConfigError(
      "LOYVERSE_ACCESS_TOKEN is not set. Create a token in the Loyverse back office under Settings > Access tokens, then pass it to this server in its env block.",
    );
  }
  const timeout = Number(env["LOYVERSE_TIMEOUT_MS"] ?? 30_000);
  return {
    accessToken,
    baseUrl: env["LOYVERSE_API_BASE"]?.trim() || DEFAULT_API_BASE,
    timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 30_000,
  };
}

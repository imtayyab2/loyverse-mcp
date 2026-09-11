#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadConfig, loadDotEnv } from "./config.js";
import { createServer } from "./server.js";

async function main(): Promise<void> {
  loadDotEnv();
  const server = createServer(loadConfig());
  await server.connect(new StdioServerTransport());
}

main().catch((error: unknown) => {
  // stdout is the MCP channel, so diagnostics must go to stderr.
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { ZodError } from "zod";
import { LoyverseClient } from "./loyverse/client.js";
import { LoyverseApiError } from "./loyverse/errors.js";
import { assertAnnotated, tools } from "./registry.js";
import type { ToolContext } from "./tools/types.js";
import type { ServerConfig } from "./config.js";

export const SERVER_NAME = "loyverse";
export const SERVER_VERSION = "0.1.0";

/**
 * Build the MCP server around one Loyverse client. The client is a parameter
 * rather than a module global so a remote deployment can build a server per
 * authenticated session without any shared token state.
 */
export function createServer(config: ServerConfig): McpServer {
  assertAnnotated();

  const ctx: ToolContext = {
    client: new LoyverseClient({
      accessToken: config.accessToken,
      baseUrl: config.baseUrl,
      timeoutMs: config.timeoutMs,
    }),
  };

  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    {
      instructions:
        "Tools for a Loyverse point-of-sale account: catalogue, stock, customers, receipts and sales reporting. " +
        "Call loyverse_get_merchant once to learn the account's currency and decimal places before formatting money. " +
        "Prefer loyverse_sales_summary over paging through raw receipts. " +
        "Sales history is limited to the last 31 days unless the account has the Unlimited Sales History add-on. " +
        "Creating receipts, issuing refunds, setting stock and deleting records all change the merchant's live books: " +
        "state exactly what will change and get the user's agreement before calling those.",
    },
  );

  for (const tool of tools) {
    server.registerTool(
      tool.name,
      {
        title: tool.annotations.title,
        description: tool.description,
        inputSchema: tool.rawSchema,
        annotations: tool.annotations,
      },
      async (args: Record<string, unknown>) => {
        try {
          const result = await tool.handler(args ?? {}, ctx);
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result ?? {}, null, 2) }],
          };
        } catch (error) {
          return { content: [{ type: "text" as const, text: describe(error) }], isError: true };
        }
      },
    );
  }

  return server;
}

function describe(error: unknown): string {
  if (error instanceof ZodError) {
    const issues = error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    return `These arguments are not valid:\n${issues.join("\n")}`;
  }
  if (error instanceof LoyverseApiError) {
    return [
      `Loyverse API error ${error.status} (${error.code}): ${error.message}`,
      error.guidance,
    ].join("\n");
  }
  if (error instanceof Error) {
    return error.name === "AbortError"
      ? "The request to Loyverse timed out. Try a narrower filter or a smaller limit."
      : `${error.name}: ${error.message}`;
  }
  return `Unexpected error: ${String(error)}`;
}

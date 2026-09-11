import { z } from "zod";
import type { LoyverseClient } from "../loyverse/client.js";

export interface ToolContext {
  client: LoyverseClient;
}

export interface ToolAnnotations {
  title: string;
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface ToolDefinition {
  name: string;
  description: string;
  annotations: ToolAnnotations;
  /** Raw shape, as the MCP SDK wants it for JSON Schema generation. */
  rawSchema: z.ZodRawShape;
  inputSchema: z.ZodObject<z.ZodRawShape>;
  handler: (args: Record<string, unknown>, ctx: ToolContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodRawShape>(spec: {
  name: string;
  title: string;
  description: string;
  /** Omit for a write tool; every read tool must set this true. */
  readOnly?: boolean;
  destructive?: boolean;
  idempotent?: boolean;
  schema: S;
  handler: (args: z.infer<z.ZodObject<S>>, ctx: ToolContext) => Promise<unknown>;
}): ToolDefinition {
  const inputSchema = z.object(spec.schema);
  return {
    name: spec.name,
    description: spec.description,
    annotations: {
      title: spec.title,
      readOnlyHint: spec.readOnly === true,
      destructiveHint: spec.destructive === true,
      idempotentHint: spec.idempotent === true,
      // Every tool reaches the Loyverse API over the internet.
      openWorldHint: true,
    },
    rawSchema: spec.schema,
    inputSchema,
    // async so a validation failure surfaces as a rejected promise rather than
    // a synchronous throw the MCP layer would not catch.
    handler: async (args, ctx) =>
      spec.handler(inputSchema.parse(args) as z.infer<z.ZodObject<S>>, ctx),
  };
}

/** Query fields shared by nearly every Loyverse list endpoint. */
export const listFields = {
  limit: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe("Maximum records to return across all pages. Defaults to 250."),
  show_deleted: z.boolean().optional().describe("Include soft-deleted records."),
};

export const timeFields = {
  created_at_min: z.string().optional().describe("ISO 8601 timestamp, inclusive lower bound."),
  created_at_max: z.string().optional().describe("ISO 8601 timestamp, inclusive upper bound."),
  updated_at_min: z.string().optional().describe("ISO 8601 timestamp, inclusive lower bound."),
  updated_at_max: z.string().optional().describe("ISO 8601 timestamp, inclusive upper bound."),
};

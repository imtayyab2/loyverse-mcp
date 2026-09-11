import { z } from "zod";
import { defineTool } from "./types.js";
import { compact, paginated } from "./helpers.js";

export const inventoryTools = [
  defineTool({
    name: "loyverse_get_inventory",
    title: "Get inventory levels",
    description:
      "Read current stock per variant per store. Filter by store_ids or variant_ids to keep the result small.",
    readOnly: true,
    schema: {
      store_ids: z.array(z.string()).optional(),
      variant_ids: z.array(z.string()).optional(),
      updated_at_min: z.string().optional().describe("ISO 8601 timestamp."),
      updated_at_max: z.string().optional().describe("ISO 8601 timestamp."),
      limit: z.number().int().min(1).max(1000).optional(),
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/inventory",
        "inventory_levels",
        compact({
          store_ids: a.store_ids,
          variant_ids: a.variant_ids,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_set_inventory",
    title: "Set inventory levels",
    description:
      "Set stock to an absolute figure for one or more variants at a store. stock_after is the resulting stock level, not a delta: sending 5 leaves 5 in stock regardless of what was there before. Read the current level with loyverse_get_inventory first if you mean to add or remove a quantity.",
    destructive: true,
    schema: {
      inventory_levels: z
        .array(
          z.object({
            variant_id: z.string(),
            store_id: z.string(),
            stock_after: z.number().describe("The absolute stock level to leave in place."),
          }),
        )
        .min(1),
    },
    handler: (a, ctx) =>
      ctx.client.request("/inventory", {
        method: "POST",
        body: { inventory_levels: a.inventory_levels },
      }),
  }),
];

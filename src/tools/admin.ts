import { z } from "zod";
import { defineTool } from "./types.js";
import { compact, unpaginated } from "./helpers.js";

/**
 * Every Loyverse resource that supports DELETE, mapped to its collection path.
 * Collapsed into one tool so the destructive surface is a single, clearly
 * annotated entry point rather than ten near-identical ones.
 */
const DELETABLE = {
  item: "/items",
  variant: "/variants",
  category: "/categories",
  modifier: "/modifiers",
  discount: "/discounts",
  tax: "/taxes",
  customer: "/customers",
  supplier: "/suppliers",
  pos_device: "/pos_devices",
  webhook: "/webhooks",
} as const;

export const adminTools = [
  defineTool({
    name: "loyverse_delete",
    title: "Delete a record",
    description:
      "Delete one record from the merchant's Loyverse account. This removes live business data and cannot be undone through the API. Name the record back to the user and get an explicit yes before calling it. Deleting an item also removes its variants and their stock history.",
    destructive: true,
    idempotent: true,
    schema: {
      resource: z
        .enum(Object.keys(DELETABLE) as [keyof typeof DELETABLE, ...(keyof typeof DELETABLE)[]])
        .describe("Which kind of record to delete."),
      id: z.string().describe("The id of the record."),
    },
    handler: async (a, ctx) => {
      const base = DELETABLE[a.resource];
      await ctx.client.request(`${base}/${encodeURIComponent(a.id)}`, { method: "DELETE" });
      return { deleted: true, resource: a.resource, id: a.id };
    },
  }),

  defineTool({
    name: "loyverse_set_item_image",
    title: "Set item image",
    description: "Attach an image to a catalogue item from a public URL, replacing any existing one.",
    idempotent: true,
    schema: {
      item_id: z.string(),
      image_url: z.string().describe("Publicly reachable https URL of the image."),
    },
    handler: (a, ctx) =>
      ctx.client.request(`/items/${encodeURIComponent(a.item_id)}/image`, {
        method: "POST",
        body: { image_url: a.image_url },
      }),
  }),

  defineTool({
    name: "loyverse_list_webhooks",
    title: "List webhooks",
    description: "List the webhook subscriptions registered on the account.",
    readOnly: true,
    schema: {},
    handler: (_a, ctx) => unpaginated(ctx, "/webhooks/", "webhooks"),
  }),

  defineTool({
    name: "loyverse_create_webhook",
    title: "Create webhook",
    description:
      "Subscribe an https endpoint to a Loyverse event. The endpoint will receive the merchant's live business data, so only register a URL the user has given you.",
    schema: {
      url: z.string().describe("The https endpoint Loyverse will POST to."),
      type: z
        .enum([
          "inventory_levels.update",
          "items.update",
          "customers.update",
          "receipts.update",
          "shifts.create",
        ])
        .describe("Which event to subscribe to."),
      status: z.enum(["ENABLED", "DISABLED"]).optional(),
    },
    handler: (a, ctx) => ctx.client.request("/webhooks/", { method: "POST", body: compact(a) }),
  }),
];

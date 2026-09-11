import { z } from "zod";
import { defineTool, listFields, timeFields } from "./types.js";
import { compact, paginated, unpaginated } from "./helpers.js";

const COLORS = [
  "GREY",
  "RED",
  "PINK",
  "ORANGE",
  "YELLOW",
  "GREEN",
  "BLUE",
  "PURPLE",
] as const;

const storeOverride = z.object({
  store_id: z.string(),
  pricing_type: z.enum(["FIXED", "VARIABLE"]).optional(),
  price: z.number().optional(),
  available_for_sale: z.boolean().optional(),
  optimal_stock: z.number().optional(),
  low_stock: z.number().optional(),
});

const variantInput = z.object({
  variant_id: z.string().optional().describe("Set to update an existing variant."),
  sku: z.string().optional(),
  barcode: z.string().optional(),
  option1_value: z.string().optional(),
  option2_value: z.string().optional(),
  option3_value: z.string().optional(),
  cost: z.number().optional(),
  purchase_cost: z.number().optional(),
  default_pricing_type: z.enum(["FIXED", "VARIABLE"]).optional(),
  default_price: z.number().optional(),
  stores: z.array(storeOverride).optional().describe("Per-store price and stock settings."),
});

export const catalogTools = [
  defineTool({
    name: "loyverse_list_items",
    title: "List items",
    description:
      "List catalogue items with their variants, prices and SKUs. Use this to find the variant_id that the inventory and receipt tools need.",
    readOnly: true,
    schema: {
      items_ids: z.array(z.string()).optional().describe("Restrict to these item ids."),
      ...timeFields,
      ...listFields,
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/items",
        "items",
        compact({
          items_ids: a.items_ids,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
          show_deleted: a.show_deleted,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_get_item",
    title: "Get item",
    description: "Fetch one catalogue item by id, including all of its variants.",
    readOnly: true,
    schema: { item_id: z.string().describe("The item id.") },
    handler: (a, ctx) => ctx.client.request(`/items/${encodeURIComponent(a.item_id)}`),
  }),

  defineTool({
    name: "loyverse_upsert_item",
    title: "Create or update item",
    description:
      "Create a catalogue item, or update one by passing its id. Loyverse uses POST for both. Stock cannot be set here; create the item first, then call loyverse_set_inventory.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create. Provide to update that item."),
      item_name: z.string().describe("Display name of the item."),
      description: z.string().optional(),
      category_id: z.string().optional(),
      track_stock: z.boolean().optional().describe("Whether Loyverse tracks stock for this item."),
      sold_by_weight: z.boolean().optional(),
      is_composite: z.boolean().optional(),
      use_production: z.boolean().optional(),
      components: z
        .array(z.object({ variant_id: z.string(), quantity: z.number() }))
        .optional()
        .describe("Only for composite items."),
      primary_supplier_id: z.string().optional(),
      tax_ids: z.array(z.string()).optional(),
      modifiers_ids: z.array(z.string()).optional(),
      form: z.enum(["SQUARE", "CIRCLE", "SUN", "OCTAGON"]).optional(),
      color: z.enum(COLORS).optional(),
      image_url: z.string().optional(),
      option1_name: z.string().optional(),
      option2_name: z.string().optional(),
      option3_name: z.string().optional(),
      variants: z
        .array(variantInput)
        .optional()
        .describe("An item needs at least one variant to be sellable."),
    },
    handler: (a, ctx) => ctx.client.request("/items", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_list_variants",
    title: "List variants",
    description:
      "List item variants, optionally filtered by SKU or parent item. A variant is the sellable unit that inventory and receipts refer to.",
    readOnly: true,
    schema: {
      variants_ids: z.array(z.string()).optional(),
      items_ids: z.array(z.string()).optional().describe("Restrict to variants of these items."),
      sku: z.string().optional().describe("Exact SKU match."),
      ...timeFields,
      ...listFields,
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/variants",
        "variants",
        compact({
          variants_ids: a.variants_ids,
          items_ids: a.items_ids,
          sku: a.sku,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
          show_deleted: a.show_deleted,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_get_variant",
    title: "Get variant",
    description: "Fetch one variant by id, including its per-store pricing.",
    readOnly: true,
    schema: { variant_id: z.string() },
    handler: (a, ctx) => ctx.client.request(`/variants/${encodeURIComponent(a.variant_id)}`),
  }),

  defineTool({
    name: "loyverse_upsert_variant",
    title: "Create or update variant",
    description:
      "Create a variant on an existing item, or update one by passing variant_id. Use this to change a price without rewriting the whole item.",
    idempotent: true,
    schema: {
      item_id: z.string().describe("The item this variant belongs to."),
      variant_id: z.string().optional().describe("Omit to create."),
      sku: z.string().optional(),
      barcode: z.string().optional(),
      option1_value: z.string().optional(),
      option2_value: z.string().optional(),
      option3_value: z.string().optional(),
      cost: z.number().optional(),
      purchase_cost: z.number().optional(),
      default_pricing_type: z.enum(["FIXED", "VARIABLE"]).optional(),
      default_price: z.number().optional(),
      stores: z.array(storeOverride).optional(),
    },
    handler: (a, ctx) => ctx.client.request("/variants", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_list_categories",
    title: "List categories",
    description: "List item categories.",
    readOnly: true,
    schema: {
      categories_ids: z.array(z.string()).optional(),
      ...listFields,
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/categories",
        "categories",
        compact({ categories_ids: a.categories_ids, show_deleted: a.show_deleted }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_upsert_category",
    title: "Create or update category",
    description: "Create a category, or rename one by passing its id.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      color: z.enum(["GREY", "RED", "PINK", "ORANGE", "GREEN", "BLUE", "PURPLE"]).optional(),
    },
    handler: (a, ctx) => ctx.client.request("/categories", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_list_modifiers",
    title: "List modifiers",
    description: "List modifier groups and their options, such as sizes or extras.",
    readOnly: true,
    schema: { modifier_ids: z.array(z.string()).optional(), ...timeFields, ...listFields },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/modifiers",
        "modifiers",
        compact({
          modifier_ids: a.modifier_ids,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
          show_deleted: a.show_deleted,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_upsert_modifier",
    title: "Create or update modifier",
    description: "Create a modifier group with its options, or update one by passing its id.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      position: z.number().int().optional(),
      stores: z.array(z.string()).optional().describe("Store ids this modifier applies to."),
      modifier_options: z
        .array(
          z.object({
            id: z.string().optional(),
            name: z.string(),
            price: z.number().optional(),
            position: z.number().int().optional(),
          }),
        )
        .optional(),
    },
    handler: (a, ctx) => ctx.client.request("/modifiers", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_list_discounts",
    title: "List discounts",
    description: "List the discounts configured on the account.",
    readOnly: true,
    schema: {
      discount_ids: z.array(z.string()).optional(),
      ...timeFields,
      show_deleted: z.boolean().optional(),
    },
    handler: (a, ctx) =>
      unpaginated(
        ctx,
        "/discounts",
        "discounts",
        compact({
          discount_ids: a.discount_ids,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
          show_deleted: a.show_deleted,
        }),
      ),
  }),

  defineTool({
    name: "loyverse_upsert_discount",
    title: "Create or update discount",
    description: "Create a discount, or update one by passing its id.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      type: z.enum([
        "FIXED_PERCENT",
        "FIXED_AMOUNT",
        "VARIABLE_PERCENT",
        "VARIABLE_AMOUNT",
        "DISCOUNT_BY_POINTS",
      ]),
      discount_amount: z.number().optional().describe("For the amount types."),
      discount_percent: z.number().optional().describe("For the percent types."),
      stores: z.array(z.string()).optional(),
      restricted_access: z.boolean().optional(),
    },
    handler: (a, ctx) => ctx.client.request("/discounts", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_list_taxes",
    title: "List taxes",
    description: "List tax rates and whether each is included in or added to the price.",
    readOnly: true,
    schema: {
      tax_ids: z.array(z.string()).optional(),
      ...timeFields,
      show_deleted: z.boolean().optional(),
    },
    handler: (a, ctx) =>
      unpaginated(
        ctx,
        "/taxes",
        "taxes",
        compact({
          tax_ids: a.tax_ids,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
          show_deleted: a.show_deleted,
        }),
      ),
  }),

  defineTool({
    name: "loyverse_upsert_tax",
    title: "Create or update tax",
    description: "Create a tax rate, or update one by passing its id.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      type: z.enum(["INCLUDED", "ADDED"]),
      rate: z.number().describe("Percentage, for example 20 for UK VAT."),
      stores: z.array(z.string()).optional(),
    },
    handler: (a, ctx) => ctx.client.request("/taxes", { method: "POST", body: compact(a) }),
  }),
];

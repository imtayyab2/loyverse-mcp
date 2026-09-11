import { z } from "zod";
import { defineTool, timeFields } from "./types.js";
import { compact, paginated } from "./helpers.js";

export const customerTools = [
  defineTool({
    name: "loyverse_list_customers",
    title: "List customers",
    description:
      "List loyalty customers with visit counts, total spend and points balance. Filter by email to find one person.",
    readOnly: true,
    schema: {
      customer_ids: z.array(z.string()).optional(),
      email: z.string().optional().describe("Exact email match."),
      ...timeFields,
      limit: z.number().int().min(1).max(1000).optional(),
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/customers",
        "customers",
        compact({
          customer_ids: a.customer_ids,
          email: a.email,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_get_customer",
    title: "Get customer",
    description: "Fetch one customer by id, including loyalty points and visit history totals.",
    readOnly: true,
    schema: { customer_id: z.string() },
    handler: (a, ctx) => ctx.client.request(`/customers/${encodeURIComponent(a.customer_id)}`),
  }),

  defineTool({
    name: "loyverse_upsert_customer",
    title: "Create or update customer",
    description:
      "Create a customer, or update one by passing its id. This writes personal data to the merchant's Loyverse account, so only pass details the customer has given.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      email: z.string().optional(),
      phone_number: z.string().optional(),
      address: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe("Two-letter ISO country code."),
      customer_code: z.string().optional().describe("Loyalty card or membership code."),
      note: z.string().optional(),
    },
    handler: (a, ctx) => ctx.client.request("/customers", { method: "POST", body: compact(a) }),
  }),
];

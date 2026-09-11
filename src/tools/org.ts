import { z } from "zod";
import { defineTool, listFields, timeFields } from "./types.js";
import { compact, paginated, unpaginated } from "./helpers.js";

export const orgTools = [
  defineTool({
    name: "loyverse_get_merchant",
    title: "Get merchant profile",
    description:
      "Fetch the account profile: business name, country, and the currency with its decimal places. Call this first to know how to format money in every other result.",
    readOnly: true,
    schema: {},
    handler: (_a, ctx) => ctx.client.request("/merchant/"),
  }),

  defineTool({
    name: "loyverse_list_stores",
    title: "List stores",
    description: "List the stores on the account with their addresses. Most filters elsewhere take a store_id from here.",
    readOnly: true,
    schema: { store_ids: z.array(z.string()).optional(), show_deleted: z.boolean().optional() },
    handler: (a, ctx) =>
      unpaginated(ctx, "/stores", "stores", compact({ store_ids: a.store_ids, show_deleted: a.show_deleted })),
  }),

  defineTool({
    name: "loyverse_get_store",
    title: "Get store",
    description: "Fetch one store by id.",
    readOnly: true,
    schema: { store_id: z.string() },
    handler: (a, ctx) => ctx.client.request(`/stores/${encodeURIComponent(a.store_id)}`),
  }),

  defineTool({
    name: "loyverse_list_employees",
    title: "List employees",
    description: "List employees and their roles. Receipts and shifts reference employees by id.",
    readOnly: true,
    schema: { employee_ids: z.array(z.string()).optional(), ...timeFields, ...listFields },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/employees",
        "employees",
        compact({
          employee_ids: a.employee_ids,
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
    name: "loyverse_get_employee",
    title: "Get employee",
    description: "Fetch one employee by id.",
    readOnly: true,
    schema: { employee_id: z.string() },
    handler: (a, ctx) => ctx.client.request(`/employees/${encodeURIComponent(a.employee_id)}`),
  }),

  defineTool({
    name: "loyverse_list_shifts",
    title: "List shifts",
    description:
      "List till shifts with their opening and closing cash amounts. Use this to reconcile a day's cash drawer.",
    readOnly: true,
    schema: {
      store_ids: z.array(z.string()).optional(),
      created_at_min: z.string().optional().describe("ISO 8601 timestamp."),
      created_at_max: z.string().optional().describe("ISO 8601 timestamp."),
      limit: z.number().int().min(1).max(1000).optional(),
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/shifts",
        "shifts",
        compact({
          store_ids: a.store_ids,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_get_shift",
    title: "Get shift",
    description: "Fetch one shift by id.",
    readOnly: true,
    schema: { shift_id: z.string() },
    handler: (a, ctx) => ctx.client.request(`/shifts/${encodeURIComponent(a.shift_id)}`),
  }),

  defineTool({
    name: "loyverse_list_payment_types",
    title: "List payment types",
    description:
      "List the payment types configured on the account. Creating a receipt requires a payment_type_id from here.",
    readOnly: true,
    schema: {
      payment_type_ids: z.array(z.string()).optional(),
      ...timeFields,
      show_deleted: z.boolean().optional(),
    },
    handler: (a, ctx) =>
      unpaginated(
        ctx,
        "/payment_types",
        "payment_types",
        compact({
          payment_type_ids: a.payment_type_ids,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
          show_deleted: a.show_deleted,
        }),
      ),
  }),

  defineTool({
    name: "loyverse_list_pos_devices",
    title: "List POS devices",
    description: "List the till devices registered to the account.",
    readOnly: true,
    schema: { store_id: z.string().optional(), show_deleted: z.boolean().optional() },
    handler: (a, ctx) =>
      unpaginated(
        ctx,
        "/pos_devices",
        "pos_devices",
        compact({ store_id: a.store_id, show_deleted: a.show_deleted }),
      ),
  }),

  defineTool({
    name: "loyverse_upsert_pos_device",
    title: "Create or update POS device",
    description: "Register a till device against a store, or rename one by passing its id.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      store_id: z.string(),
    },
    handler: (a, ctx) => ctx.client.request("/pos_devices", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_list_suppliers",
    title: "List suppliers",
    description: "List suppliers with their contact details.",
    readOnly: true,
    schema: { suppliers_ids: z.array(z.string()).optional(), ...listFields },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/suppliers/",
        "suppliers",
        compact({ suppliers_ids: a.suppliers_ids, show_deleted: a.show_deleted }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_get_supplier",
    title: "Get supplier",
    description: "Fetch one supplier by id.",
    readOnly: true,
    schema: { supplier_id: z.string() },
    handler: (a, ctx) => ctx.client.request(`/suppliers/${encodeURIComponent(a.supplier_id)}`),
  }),

  defineTool({
    name: "loyverse_upsert_supplier",
    title: "Create or update supplier",
    description: "Create a supplier, or update one by passing its id.",
    idempotent: true,
    schema: {
      id: z.string().optional().describe("Omit to create."),
      name: z.string(),
      contact: z.string().optional(),
      email: z.string().optional(),
      phone_number: z.string().optional(),
      website: z.string().optional(),
      address_1: z.string().optional(),
      address_2: z.string().optional(),
      city: z.string().optional(),
      region: z.string().optional(),
      postal_code: z.string().optional(),
      country_code: z.string().optional().describe("Two-letter ISO country code."),
      note: z.string().optional(),
    },
    handler: (a, ctx) => ctx.client.request("/suppliers/", { method: "POST", body: compact(a) }),
  }),
];

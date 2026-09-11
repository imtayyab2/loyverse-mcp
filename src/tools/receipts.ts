import { z } from "zod";
import { defineTool } from "./types.js";
import { compact, paginated } from "./helpers.js";

export const receiptTools = [
  defineTool({
    name: "loyverse_list_receipts",
    title: "List receipts",
    description:
      "List sales and refund receipts with their line items, taxes, discounts and payments. Without the Unlimited Sales History add-on the account only serves the last 31 days, and older ranges return a payment-required error.",
    readOnly: true,
    schema: {
      store_id: z.string().optional(),
      receipt_numbers: z.array(z.string()).optional(),
      since_receipt_number: z.string().optional(),
      before_receipt_number: z.string().optional(),
      source: z.string().optional().describe("Filter by the application that created the receipt."),
      order: z.string().optional().describe("Sort order, for example ASC or DESC."),
      created_at_min: z.string().optional().describe("ISO 8601 timestamp."),
      created_at_max: z.string().optional().describe("ISO 8601 timestamp."),
      updated_at_min: z.string().optional().describe("ISO 8601 timestamp."),
      updated_at_max: z.string().optional().describe("ISO 8601 timestamp."),
      limit: z.number().int().min(1).max(1000).optional(),
    },
    handler: (a, ctx) =>
      paginated(
        ctx,
        "/receipts",
        "receipts",
        compact({
          store_id: a.store_id,
          receipt_numbers: a.receipt_numbers,
          since_receipt_number: a.since_receipt_number,
          before_receipt_number: a.before_receipt_number,
          source: a.source,
          order: a.order,
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          updated_at_min: a.updated_at_min,
          updated_at_max: a.updated_at_max,
        }),
        a.limit,
      ),
  }),

  defineTool({
    name: "loyverse_get_receipt",
    title: "Get receipt",
    description: "Fetch one receipt by its receipt number.",
    readOnly: true,
    schema: { receipt_number: z.string() },
    handler: (a, ctx) => ctx.client.request(`/receipts/${encodeURIComponent(a.receipt_number)}`),
  }),

  defineTool({
    name: "loyverse_create_receipt",
    title: "Create receipt",
    description:
      "Record a sale. This posts a real transaction to the merchant's books and affects stock and reporting, so confirm the line items and total with the user before calling it. A receipt created through the API can carry only one payment type; split tender is not supported.",
    schema: {
      store_id: z.string().optional(),
      employee_id: z.string().optional(),
      customer_id: z.string().optional(),
      order: z.string().optional().describe("Your own order reference."),
      source: z.string().optional().describe("Name of the system recording the sale."),
      receipt_date: z.string().optional().describe("ISO 8601 timestamp. Defaults to now."),
      note: z.string().optional(),
      line_items: z
        .array(
          z.object({
            variant_id: z.string(),
            quantity: z.number(),
            price: z.number().optional().describe("Overrides the catalogue price."),
            cost: z.number().optional(),
            line_note: z.string().optional(),
            line_taxes: z.array(z.object({ id: z.string() })).optional(),
            line_discounts: z.array(z.object({ id: z.string() })).optional(),
            line_modifiers: z
              .array(
                z.object({
                  modifier_option_id: z.string(),
                  price: z.number().optional(),
                }),
              )
              .optional(),
          }),
        )
        .min(1),
      total_discounts: z
        .array(
          z.object({
            id: z.string().optional(),
            scope: z.enum(["RECEIPT", "LINE_ITEM"]).optional(),
            percentage: z.number().optional(),
            money_amount: z.number().optional(),
          }),
        )
        .optional(),
      payments: z
        .array(
          z.object({
            payment_type_id: z.string().describe("From loyverse_list_payment_types."),
            money_amount: z.number(),
            name: z.string().optional(),
            type: z.string().optional(),
            paid_at: z.string().optional().describe("ISO 8601 timestamp."),
          }),
        )
        .min(1)
        .max(1, "Loyverse accepts only one payment type per API-created receipt."),
    },
    handler: (a, ctx) => ctx.client.request("/receipts", { method: "POST", body: compact(a) }),
  }),

  defineTool({
    name: "loyverse_refund_receipt",
    title: "Refund receipt",
    description:
      "Issue a refund against an existing receipt, in full or for named line items. This moves money and restores stock, and it cannot be undone through the API. Always confirm the receipt number, the lines and the quantities with the user first.",
    destructive: true,
    schema: {
      receipt_number: z.string().describe("The receipt being refunded."),
      line_items: z
        .array(
          z.object({
            id: z.string().describe("The line_item id from the original receipt, not the variant id."),
            quantity: z.number().describe("How many units of that line to refund."),
          }),
        )
        .min(1),
      store_id: z.string().optional(),
      employee_id: z.string().optional(),
      source: z.string().optional(),
      receipt_date: z.string().optional().describe("ISO 8601 timestamp."),
    },
    handler: (a, ctx) =>
      ctx.client.request(`/receipts/${encodeURIComponent(a.receipt_number)}/refund`, {
        method: "POST",
        body: compact({
          line_items: a.line_items,
          store_id: a.store_id,
          employee_id: a.employee_id,
          source: a.source,
          receipt_date: a.receipt_date,
        }),
      }),
  }),
];

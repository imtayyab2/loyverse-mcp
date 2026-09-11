import { z } from "zod";
import { defineTool } from "./types.js";
import type { ToolContext } from "./types.js";
import { compact } from "./helpers.js";

interface LineItem {
  item_id?: string;
  variant_id?: string;
  item_name?: string;
  variant_name?: string;
  quantity?: number;
  total_money?: number;
  gross_total_money?: number;
  cost_total?: number;
}

interface Receipt {
  receipt_number?: string;
  receipt_type?: string;
  receipt_date?: string;
  created_at?: string;
  cancelled_at?: string | null;
  store_id?: string;
  employee_id?: string;
  total_money?: number;
  total_tax?: number;
  total_discount?: number;
  tip?: number;
  surcharge?: number;
  line_items?: LineItem[];
  payments?: { payment_type_id?: string; name?: string; money_amount?: number }[];
}

type GroupBy = "day" | "item" | "category" | "payment_type" | "employee" | "store" | "none";

const round = (n: number) => Math.round(n * 100) / 100;

/** Magnitudes only. Refunds are counted in their own bucket, so sign conventions cannot double-count. */
const mag = (n: number | undefined) => Math.abs(n ?? 0);

export const reportTools = [
  defineTool({
    name: "loyverse_sales_summary",
    title: "Summarise sales",
    description:
      "Aggregate receipts over a date range into totals and a breakdown, without the model having to page through raw receipts. Reports gross sales, refunds, discounts, tax, tips and net, plus a ranked breakdown by day, item, category, payment type, employee or store. Cancelled receipts are excluded. Without the Unlimited Sales History add-on the account only serves the last 31 days.",
    readOnly: true,
    schema: {
      created_at_min: z.string().describe("Start of the range, ISO 8601. Inclusive."),
      created_at_max: z.string().describe("End of the range, ISO 8601. Inclusive."),
      store_id: z.string().optional().describe("Restrict to one store."),
      group_by: z
        .enum(["day", "item", "category", "payment_type", "employee", "store", "none"])
        .default("day")
        .describe("How to break the totals down."),
      top: z
        .number()
        .int()
        .min(1)
        .max(100)
        .default(20)
        .describe("Keep only the highest-selling N groups. Ignored when grouping by day."),
      max_receipts: z
        .number()
        .int()
        .min(1)
        .max(5000)
        .default(2000)
        .describe("Safety cap on how many receipts to read."),
    },
    handler: async (a, ctx) => {
      const { items: receipts, truncated } = await ctx.client.listAll<Receipt>(
        "/receipts",
        "receipts",
        compact({
          created_at_min: a.created_at_min,
          created_at_max: a.created_at_max,
          store_id: a.store_id,
        }),
        a.max_receipts,
      );

      const live = receipts.filter((r) => !r.cancelled_at);
      const sales = live.filter((r) => r.receipt_type !== "REFUND");
      const refunds = live.filter((r) => r.receipt_type === "REFUND");

      const grossSales = sales.reduce((s, r) => s + mag(r.total_money), 0);
      const refundTotal = refunds.reduce((s, r) => s + mag(r.total_money), 0);

      const totals = {
        receipts: sales.length,
        refunds: refunds.length,
        gross_sales: round(grossSales),
        refunds_value: round(refundTotal),
        net_sales: round(grossSales - refundTotal),
        discounts: round(sales.reduce((s, r) => s + mag(r.total_discount), 0)),
        tax: round(sales.reduce((s, r) => s + mag(r.total_tax), 0)),
        tips: round(sales.reduce((s, r) => s + mag(r.tip), 0)),
        surcharges: round(sales.reduce((s, r) => s + mag(r.surcharge), 0)),
        average_receipt: sales.length ? round(grossSales / sales.length) : 0,
        cancelled_excluded: receipts.length - live.length,
      };

      const breakdown = await buildBreakdown(a.group_by as GroupBy, sales, refunds, ctx, a.top);

      return {
        range: { from: a.created_at_min, to: a.created_at_max, store_id: a.store_id ?? "all" },
        totals,
        group_by: a.group_by,
        breakdown,
        truncated,
        note: truncated
          ? `Stopped at the ${a.max_receipts}-receipt cap, so these totals are partial. Narrow the range or raise max_receipts.`
          : undefined,
      };
    },
  }),
];

async function buildBreakdown(
  groupBy: GroupBy,
  sales: Receipt[],
  refunds: Receipt[],
  ctx: ToolContext,
  top: number,
) {
  if (groupBy === "none") return undefined;

  const buckets = new Map<string, { key: string; label?: string; amount: number; quantity: number; count: number }>();
  /** `count` is incremented only for rows that represent a sale, so a refund
   *  reduces the day's money without inflating its receipt count. */
  const add = (key: string, amount: number, quantity: number, label?: string, count = 1) => {
    const b = buckets.get(key) ?? { key, label, amount: 0, quantity: 0, count: 0 };
    b.amount += amount;
    b.quantity += quantity;
    b.count += count;
    if (label && !b.label) b.label = label;
    buckets.set(key, b);
  };

  if (groupBy === "day") {
    for (const r of sales) {
      const day = (r.receipt_date ?? r.created_at ?? "").slice(0, 10) || "unknown";
      add(day, mag(r.total_money), 1);
    }
    for (const r of refunds) {
      const day = (r.receipt_date ?? r.created_at ?? "").slice(0, 10) || "unknown";
      add(day, -mag(r.total_money), 0, undefined, 0);
    }
    return [...buckets.values()]
      .sort((x, y) => x.key.localeCompare(y.key))
      .map((b) => ({ date: b.key, sales: round(b.amount), receipts: b.count }));
  }

  if (groupBy === "payment_type") {
    for (const r of sales) {
      for (const p of r.payments ?? []) {
        add(p.payment_type_id ?? "unknown", mag(p.money_amount), 1, p.name);
      }
    }
  } else if (groupBy === "employee") {
    for (const r of sales) add(r.employee_id ?? "unassigned", mag(r.total_money), 1);
  } else if (groupBy === "store") {
    for (const r of sales) add(r.store_id ?? "unknown", mag(r.total_money), 1);
  } else if (groupBy === "item" || groupBy === "category") {
    let categoryOf: Map<string, string> | undefined;
    let categoryName: Map<string, string> | undefined;

    if (groupBy === "category") {
      const { items } = await ctx.client.listAll<{ id?: string; category_id?: string }>(
        "/items",
        "items",
        {},
        1000,
      );
      categoryOf = new Map(items.filter((i) => i.id).map((i) => [i.id as string, i.category_id ?? "uncategorised"]));
      const { items: cats } = await ctx.client.listAll<{ id?: string; name?: string }>(
        "/categories",
        "categories",
        {},
        1000,
      );
      categoryName = new Map(cats.filter((c) => c.id).map((c) => [c.id as string, c.name ?? ""]));
    }

    for (const r of sales) {
      for (const li of r.line_items ?? []) {
        const amount = mag(li.total_money ?? li.gross_total_money);
        const qty = li.quantity ?? 0;
        if (groupBy === "item") {
          const name = [li.item_name, li.variant_name].filter(Boolean).join(" / ");
          add(li.variant_id ?? li.item_id ?? name ?? "unknown", amount, qty, name || undefined);
        } else {
          const cat = categoryOf?.get(li.item_id ?? "") ?? "uncategorised";
          add(cat, amount, qty, categoryName?.get(cat) ?? "Uncategorised");
        }
      }
    }
  }

  return [...buckets.values()]
    .sort((x, y) => y.amount - x.amount)
    .slice(0, top)
    .map((b) => ({
      id: b.key,
      name: b.label,
      sales: round(b.amount),
      quantity: round(b.quantity),
      occurrences: b.count,
    }));
}

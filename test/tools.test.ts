import { describe, expect, it, vi } from "vitest";
import { LoyverseClient } from "../src/loyverse/client.js";
import { assertAnnotated, tools, toolsByName } from "../src/registry.js";
import type { ToolContext } from "../src/tools/types.js";
import receiptsFixture from "./fixtures/receipts.json" with { type: "json" };

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function contextReturning(...pages: unknown[]): { ctx: ToolContext; fetchImpl: ReturnType<typeof vi.fn> } {
  const fetchImpl = vi.fn();
  for (const page of pages) fetchImpl.mockResolvedValueOnce(jsonResponse(page));
  fetchImpl.mockResolvedValue(jsonResponse({}));
  return {
    fetchImpl,
    ctx: {
      client: new LoyverseClient({
        accessToken: "t",
        fetchImpl: fetchImpl as unknown as typeof fetch,
        sleep: async () => {},
      }),
    },
  };
}

const run = (name: string, args: Record<string, unknown>, ctx: ToolContext) => {
  const tool = toolsByName.get(name);
  if (!tool) throw new Error(`no such tool: ${name}`);
  return tool.handler(args, ctx);
};

describe("tool registry", () => {
  it("every tool carries a title and a read-only or destructive hint", () => {
    expect(() => assertAnnotated()).not.toThrow();
    for (const tool of tools) {
      expect(tool.annotations.title, tool.name).toBeTruthy();
      expect(typeof tool.annotations.readOnlyHint, tool.name).toBe("boolean");
    }
  });

  it("uses one unique loyverse-prefixed name per tool", () => {
    const names = tools.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) expect(name).toMatch(/^loyverse_[a-z_]+$/);
  });

  it("marks exactly the irreversible operations destructive", () => {
    const destructive = tools.filter((t) => t.annotations.destructiveHint).map((t) => t.name).sort();
    expect(destructive).toEqual([
      "loyverse_delete",
      "loyverse_refund_receipt",
      "loyverse_set_inventory",
    ]);
  });

  it("never marks a write tool read-only", () => {
    for (const tool of tools) {
      if (tool.annotations.readOnlyHint) {
        expect(tool.annotations.destructiveHint, tool.name).toBe(false);
      }
    }
  });
});

describe("input validation", () => {
  it("rejects a receipt with more than one payment, which Loyverse cannot accept", async () => {
    const { ctx } = contextReturning({});
    await expect(
      run(
        "loyverse_create_receipt",
        {
          line_items: [{ variant_id: "v1", quantity: 1 }],
          payments: [
            { payment_type_id: "p1", money_amount: 5 },
            { payment_type_id: "p2", money_amount: 5 },
          ],
        },
        ctx,
      ),
    ).rejects.toThrow(/only one payment type/i);
  });

  it("rejects a delete for a resource Loyverse cannot delete", async () => {
    const { ctx } = contextReturning({});
    await expect(run("loyverse_delete", { resource: "receipt", id: "1" }, ctx)).rejects.toThrow();
  });

  it("requires at least one line item on a refund", async () => {
    const { ctx } = contextReturning({});
    await expect(
      run("loyverse_refund_receipt", { receipt_number: "1-1001", line_items: [] }, ctx),
    ).rejects.toThrow();
  });
});

describe("loyverse_set_inventory", () => {
  it("posts stock_after untouched, as an absolute level", async () => {
    const { ctx, fetchImpl } = contextReturning({ inventory_levels: [] });
    await run(
      "loyverse_set_inventory",
      { inventory_levels: [{ variant_id: "v1", store_id: "s1", stock_after: 12 }] },
      ctx,
    );

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({
      inventory_levels: [{ variant_id: "v1", store_id: "s1", stock_after: 12 }],
    });
  });
});

describe("loyverse_upsert_item", () => {
  it("uses POST for an update, because Loyverse rejects PUT on /items", async () => {
    const { ctx, fetchImpl } = contextReturning({ id: "i1" });
    await run("loyverse_upsert_item", { id: "i1", item_name: "Karahi" }, ctx);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(init.method).toBe("POST");
    expect(url).toContain("/v1.0/items");
    expect(JSON.parse(init.body as string)).toEqual({ id: "i1", item_name: "Karahi" });
  });

  it("omits fields the caller left out rather than sending nulls", async () => {
    const { ctx, fetchImpl } = contextReturning({ id: "i1" });
    await run("loyverse_upsert_item", { item_name: "Seekh Kebab" }, ctx);

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(Object.keys(JSON.parse(init.body as string))).toEqual(["item_name"]);
  });
});

describe("loyverse_sales_summary", () => {
  const range = { created_at_min: "2026-09-01T00:00:00Z", created_at_max: "2026-09-03T23:59:59Z" };

  it("separates refunds from sales and nets them", async () => {
    const { ctx } = contextReturning(receiptsFixture);
    const result = (await run(
      "loyverse_sales_summary",
      { ...range, group_by: "none" },
      ctx,
    )) as { totals: Record<string, number> };

    // Fixture: three sales of 20.00, 30.50 and 10.00, one refund of 10.00, one cancelled.
    expect(result.totals["receipts"]).toBe(3);
    expect(result.totals["refunds"]).toBe(1);
    expect(result.totals["gross_sales"]).toBe(60.5);
    expect(result.totals["refunds_value"]).toBe(10);
    expect(result.totals["net_sales"]).toBe(50.5);
    expect(result.totals["cancelled_excluded"]).toBe(1);
  });

  it("nets a refund against the day it falls on", async () => {
    const { ctx } = contextReturning(receiptsFixture);
    const result = (await run("loyverse_sales_summary", { ...range, group_by: "day" }, ctx)) as {
      breakdown: { date: string; sales: number }[];
    };

    expect(result.breakdown).toEqual([
      { date: "2026-09-01", sales: 20, receipts: 1 },
      { date: "2026-09-02", sales: 30.5, receipts: 1 },
      { date: "2026-09-03", sales: 0, receipts: 1 },
    ]);
  });

  it("ranks items by value sold", async () => {
    const { ctx } = contextReturning(receiptsFixture);
    const result = (await run("loyverse_sales_summary", { ...range, group_by: "item" }, ctx)) as {
      breakdown: { name: string; sales: number; quantity: number }[];
    };

    expect(result.breakdown[0]?.name).toBe("Lamb Karahi / Full");
    expect(result.breakdown[0]?.sales).toBe(30.5);
    expect(result.breakdown[0]?.quantity).toBe(2);
  });

  it("computes an average receipt and does not divide by zero when empty", async () => {
    const { ctx } = contextReturning({ receipts: [] });
    const result = (await run("loyverse_sales_summary", { ...range, group_by: "none" }, ctx)) as {
      totals: Record<string, number>;
    };

    expect(result.totals["average_receipt"]).toBe(0);
    expect(result.totals["net_sales"]).toBe(0);
  });

  it("flags a truncated range instead of reporting partial totals as complete", async () => {
    const page = { receipts: receiptsFixture.receipts, cursor: "more" };
    const { ctx } = contextReturning(page, page, page);
    const result = (await run(
      "loyverse_sales_summary",
      { ...range, group_by: "none", max_receipts: 10 },
      ctx,
    )) as { truncated: boolean; note?: string };

    expect(result.truncated).toBe(true);
    expect(result.note).toMatch(/partial/);
  });
});

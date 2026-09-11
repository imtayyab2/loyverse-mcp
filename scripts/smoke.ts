/**
 * Exercises every read-only tool against the live Loyverse account named by
 * LOYVERSE_ACCESS_TOKEN, and prints a pass/fail line per tool.
 *
 * Read-only by design. Write tools are never called from here, because this
 * runs against a real merchant's books.
 */
import { LoyverseClient } from "../src/loyverse/client.js";
import { loadConfig, loadDotEnv } from "../src/config.js";
import { tools } from "../src/registry.js";
import type { ToolContext } from "../src/tools/types.js";

loadDotEnv();
const config = loadConfig();
const ctx: ToolContext = { client: new LoyverseClient(config) };

const day = 24 * 60 * 60 * 1000;
const iso = (offsetDays: number) => new Date(Date.now() - offsetDays * day).toISOString();

/** Ids discovered as the run proceeds, so the get-one tools have something real to fetch. */
const found: Record<string, string> = {};

function argsFor(name: string): Record<string, unknown> | null {
  switch (name) {
    case "loyverse_get_item":
      return found["item"] ? { item_id: found["item"] } : null;
    case "loyverse_get_variant":
      return found["variant"] ? { variant_id: found["variant"] } : null;
    case "loyverse_get_store":
      return found["store"] ? { store_id: found["store"] } : null;
    case "loyverse_get_employee":
      return found["employee"] ? { employee_id: found["employee"] } : null;
    case "loyverse_get_customer":
      return found["customer"] ? { customer_id: found["customer"] } : null;
    case "loyverse_get_supplier":
      return found["supplier"] ? { supplier_id: found["supplier"] } : null;
    case "loyverse_get_shift":
      return found["shift"] ? { shift_id: found["shift"] } : null;
    case "loyverse_get_receipt":
      return found["receipt"] ? { receipt_number: found["receipt"] } : null;
    case "loyverse_sales_summary":
      return { created_at_min: iso(7), created_at_max: iso(0), group_by: "day" };
    case "loyverse_list_receipts":
      return { created_at_min: iso(7), created_at_max: iso(0), limit: 50 };
    case "loyverse_get_inventory":
      return { limit: 25 };
    default:
      return { limit: 25 };
  }
}

function remember(name: string, result: unknown): void {
  const r = result as Record<string, unknown>;
  const first = (key: string) => (Array.isArray(r[key]) ? (r[key] as Record<string, unknown>[])[0] : undefined);
  const pick = (key: string, field = "id") => {
    const v = first(key)?.[field];
    return typeof v === "string" ? v : undefined;
  };

  if (name === "loyverse_list_items") found["item"] = pick("items") ?? found["item"] ?? "";
  if (name === "loyverse_list_variants") found["variant"] = pick("variants", "variant_id") ?? found["variant"] ?? "";
  if (name === "loyverse_list_stores") found["store"] = pick("stores") ?? found["store"] ?? "";
  if (name === "loyverse_list_employees") found["employee"] = pick("employees") ?? found["employee"] ?? "";
  if (name === "loyverse_list_customers") found["customer"] = pick("customers") ?? found["customer"] ?? "";
  if (name === "loyverse_list_suppliers") found["supplier"] = pick("suppliers") ?? found["supplier"] ?? "";
  if (name === "loyverse_list_shifts") found["shift"] = pick("shifts") ?? found["shift"] ?? "";
  if (name === "loyverse_list_receipts") found["receipt"] = pick("receipts", "receipt_number") ?? found["receipt"] ?? "";
  for (const key of Object.keys(found)) if (!found[key]) delete found[key];
}

// Lists first, so the get-one tools have ids to work with.
const readOnly = tools.filter((t) => t.annotations.readOnlyHint);
const ordered = [
  ...readOnly.filter((t) => !t.name.startsWith("loyverse_get_") || t.name === "loyverse_get_merchant"),
  ...readOnly.filter((t) => t.name.startsWith("loyverse_get_") && t.name !== "loyverse_get_merchant"),
];

let passed = 0;
let failed = 0;
let skipped = 0;

for (const tool of ordered) {
  const args = argsFor(tool.name);
  if (args === null) {
    console.log(`SKIP  ${tool.name}  (no id available in this account)`);
    skipped++;
    continue;
  }
  try {
    const result = await tool.handler(args, ctx);
    remember(tool.name, result);
    const r = result as Record<string, unknown>;
    const shape =
      typeof r["count"] === "number"
        ? `${r["count"]} record(s)`
        : Object.keys(r).slice(0, 4).join(", ");
    console.log(`PASS  ${tool.name}  ${shape}`);
    passed++;
  } catch (error) {
    console.log(`FAIL  ${tool.name}  ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

const writeTools = tools.filter((t) => !t.annotations.readOnlyHint).map((t) => t.name);
console.log(`\n${passed} passed, ${failed} failed, ${skipped} skipped.`);
console.log(`Not exercised here (they write to the account): ${writeTools.join(", ")}`);
process.exit(failed > 0 ? 1 : 0);

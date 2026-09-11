import { adminTools } from "./tools/admin.js";
import { catalogTools } from "./tools/catalog.js";
import { customerTools } from "./tools/customers.js";
import { inventoryTools } from "./tools/inventory.js";
import { orgTools } from "./tools/org.js";
import { receiptTools } from "./tools/receipts.js";
import { reportTools } from "./tools/reports.js";
import type { ToolDefinition } from "./tools/types.js";

export const tools: ToolDefinition[] = [
  ...orgTools,
  ...catalogTools,
  ...inventoryTools,
  ...customerTools,
  ...receiptTools,
  ...reportTools,
  ...adminTools,
];

export const toolsByName = new Map(tools.map((t) => [t.name, t]));

/** Fails the build rather than the connector review if an annotation is missing. */
export function assertAnnotated(list: ToolDefinition[] = tools): void {
  const bad = list.filter(
    (t) => !t.annotations.title || (!t.annotations.readOnlyHint && !t.annotations.destructiveHint && !isWrite(t)),
  );
  if (bad.length) {
    throw new Error(`Tools missing required annotations: ${bad.map((t) => t.name).join(", ")}`);
  }
}

function isWrite(tool: ToolDefinition): boolean {
  return tool.annotations.readOnlyHint === false;
}

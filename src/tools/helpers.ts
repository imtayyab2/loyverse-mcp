import type { Query } from "../loyverse/client.js";
import type { ToolContext } from "./types.js";

export const DEFAULT_MAX_ITEMS = 250;

/**
 * Endpoints that accept `limit` and `cursor`. Everything else returns its
 * whole collection in one response and rejects pagination parameters.
 */
export async function paginated(
  ctx: ToolContext,
  path: string,
  key: string,
  query: Query,
  limit?: number,
) {
  const { items, truncated } = await ctx.client.listAll<unknown>(
    path,
    key,
    query,
    limit ?? DEFAULT_MAX_ITEMS,
  );
  return { [key]: items, count: items.length, truncated };
}

/** Endpoints that return the full collection in a single response. */
export async function unpaginated(ctx: ToolContext, path: string, key: string, query: Query = {}) {
  const page = await ctx.client.request<Record<string, unknown>>(path, { query });
  const items = Array.isArray(page[key]) ? (page[key] as unknown[]) : [];
  return { [key]: items, count: items.length, truncated: false };
}

/** Drop undefined keys so they never reach the query string or a POST body. */
export function compact<T extends Record<string, unknown>>(input: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(input).filter(([, v]) => v !== undefined),
  ) as Partial<T>;
}

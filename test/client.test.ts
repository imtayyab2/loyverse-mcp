import { describe, expect, it, vi } from "vitest";
import { LoyverseClient } from "../src/loyverse/client.js";
import { LoyverseApiError } from "../src/loyverse/errors.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function makeClient(fetchImpl: typeof fetch, maxRetries = 3) {
  return new LoyverseClient({
    accessToken: "test-token",
    fetchImpl,
    maxRetries,
    sleep: async () => {},
  });
}

describe("LoyverseClient", () => {
  it("sends the bearer token exactly as Loyverse requires", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ ok: true }));
    await makeClient(fetchImpl as unknown as typeof fetch).request("/merchant/");

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["Authorization"]).toBe("Bearer test-token");
  });

  it("joins array query values with commas and drops empty ones", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }));
    await makeClient(fetchImpl as unknown as typeof fetch).request("/items", {
      query: { items_ids: ["a", "b"], sku: undefined, show_deleted: false },
    });

    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(url.pathname).toBe("/v1.0/items");
    expect(url.searchParams.get("items_ids")).toBe("a,b");
    expect(url.searchParams.has("sku")).toBe(false);
    expect(url.searchParams.get("show_deleted")).toBe("false");
  });

  it("retries a 429 and then succeeds", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ message: "slow down" }, 429))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "1" }] }));

    const result = await makeClient(fetchImpl as unknown as typeof fetch).request<{
      items: unknown[];
    }>("/items");

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.items).toHaveLength(1);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "busy" }, 503));
    const client = makeClient(fetchImpl as unknown as typeof fetch, 2);

    await expect(client.request("/items")).rejects.toBeInstanceOf(LoyverseApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it("does not retry a 401 and explains what to do", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "bad token" }, 401));

    await expect(makeClient(fetchImpl as unknown as typeof fetch).request("/items")).rejects.toThrow(
      /bad token/,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("explains the 402 that means the sales-history add-on is missing", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ message: "payment required" }, 402));
    try {
      await makeClient(fetchImpl as unknown as typeof fetch).request("/receipts");
      expect.unreachable("should have thrown");
    } catch (error) {
      expect((error as LoyverseApiError).guidance).toMatch(/31 days/);
    }
  });

  it("follows the cursor until the collection is exhausted", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "1" }, { id: "2" }], cursor: "c1" }))
      .mockResolvedValueOnce(jsonResponse({ items: [{ id: "3" }] }));

    const { items, truncated } = await makeClient(
      fetchImpl as unknown as typeof fetch,
    ).listAll<{ id: string }>("/items", "items");

    expect(items.map((i) => i.id)).toEqual(["1", "2", "3"]);
    expect(truncated).toBe(false);
    const secondUrl = new URL((fetchImpl.mock.calls[1] as unknown as [string])[0]);
    expect(secondUrl.searchParams.get("cursor")).toBe("c1");
  });

  it("stops at maxItems and reports the result as truncated", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ items: [{ id: "a" }, { id: "b" }], cursor: "next" }),
    );

    const { items, truncated } = await makeClient(
      fetchImpl as unknown as typeof fetch,
    ).listAll<{ id: string }>("/items", "items", {}, 4);

    expect(items).toHaveLength(4);
    expect(truncated).toBe(true);
  });

  it("never asks for more than the 250-object page cap", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [] }));
    await makeClient(fetchImpl as unknown as typeof fetch).listAll("/items", "items", {}, 1000);

    const url = new URL((fetchImpl.mock.calls[0] as unknown as [string])[0]);
    expect(Number(url.searchParams.get("limit"))).toBe(250);
  });
});
